// Checks the supermarket product rules: barcodes and their check digit, a
// product from Open Food Facts read into a food's figures, shop names, shared
// prices, and the limiter and cache that keep Hemlo within Open Food Facts'
// limits. Real answers from the three services are copied in, trimmed.
import {
  checkDigit, normaliseBarcode, expandUpcE, maybeShopLabel, offCountry, offLang, cleanQuery, searchUrl, productUrl, pricesUrl,
  kcalOf, per100Of, readQuantity, packOf, storeName, storesOf, safeImage, readProduct, readSearch, displayName, sectionOf, stateOf,
  foodFields, productFromFood, foodWithBarcode, deletedWith, stockGrams, formatDay, formatPrice, perUnitLabel, readPrices,
  RateLimiter, TtlCache, searchKey, LIMITS, TTL, euOf, nutriScoreOf, labelRows, lookupFound, USER_AGENT,
} from '../lib/products-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// Barcodes.
is('check digit of a real EAN-13 (De Ruijter hagel)', checkDigit('871049697912'), 5)
is('check digit of a real EAN-8 (Kiekeboe)', checkDigit('2302918'), 7)
is('an EAN-13 is kept', normaliseBarcode('8710496979125'), '8710496979125')
is('spaces and dashes typed with it are dropped', normaliseBarcode(' 8710 4969-79125 '), '8710496979125')
is('one wrong digit is caught', normaliseBarcode('8710496979126'), null)
is('two digits swapped are caught', normaliseBarcode('8710496979215'), null)
is('an EAN-8 is kept', normaliseBarcode('23029187'), '23029187')
is('a UPC-A gets the leading 0 Open Food Facts uses', normaliseBarcode('036000291452'), '0036000291452')
is('a 14-digit code starting with 0 is its 13 digits', normaliseBarcode('08710496979125'), '8710496979125')
is('a real GTIN-14 stays 14', normaliseBarcode('18710496979122'), '18710496979122')
is('too short is no barcode', normaliseBarcode('1234567'), null)
is('9, 10 or 11 digits are no barcode', [normaliseBarcode('123456789'), normaliseBarcode('1234567890'), normaliseBarcode('12345678901')], [null, null, null])
is('letters are no barcode', normaliseBarcode('87104969791a5'), null)
is('all zeros is no barcode', normaliseBarcode('0000000000000'), null)
is('nothing is no barcode', [normaliseBarcode(''), normaliseBarcode(null), normaliseBarcode(undefined)], [null, null, null])
is('UPC-E written out in full (Coca-Cola 12 oz)', expandUpcE('04963406'), '049000006346')
is('UPC-E read by the scanner becomes 13 digits', normaliseBarcode('04963406', 'UPC_E'), '0049000006346')
is('eight typed digits that only check as UPC-E are read as UPC-E', normaliseBarcode('04963406'), '0049000006346')
is('a UPC-E with a wrong check digit is refused', expandUpcE('04963407'), null)
is('a shop label starts with 2', [maybeShopLabel('2123456789012'), maybeShopLabel('8710496979125'), maybeShopLabel('23029187')], [true, false, false])

// Countries and the words searched.
is('the profile country as Open Food Facts tags it', offCountry('NL'), 'en:netherlands')
is('lower case is fine', offCountry('lt'), 'en:lithuania')
is('names with two words', offCountry('GB'), 'en:united-kingdom')
is('names Open Food Facts spells differently', offCountry('CZ'), 'en:czech-republic')
is('no country falls back to the Netherlands', [offCountry(null), offCountry(''), offCountry('XX')], ['en:netherlands', 'en:netherlands', 'en:netherlands'])
is('product names in the country’s language', [offLang('NL'), offLang('BE'), offLang('LT'), offLang('US'), offLang(null)], ['nl', 'nl', 'lt', 'en', 'en'])
is('a search is tidied', cleanQuery('  halfvolle   melk '), 'halfvolle melk')
is('search commands are dropped', cleanQuery('pinda"kaas" OR (brands:*)'), 'pinda kaas OR brands')
is('one letter is not worth sending', [cleanQuery('a'), cleanQuery(' ! '), cleanQuery('ab')], ['', '', 'ab'])
is('at most 80 characters', cleanQuery('x'.repeat(200)).length, 80)
is('the same search in other capitals is the same', searchKey(' Hagelslag ', 'en:netherlands'), searchKey('hagelslag', 'en:netherlands'))

const newer = searchUrl('search', 'hagelslag', 'en:netherlands', 'nl', '0.2.0')
is('the newer search filters on the country', newer.includes(encodeURIComponent('hagelslag countries_tags:"en:netherlands"')), true)
is('and asks for Dutch names first', newer.includes('langs=nl%2Cen'), true)
is('and says it is Hemlo', newer.endsWith('app_name=Hemlo&app_version=0.2.0'), true)
const older = searchUrl('legacy', 'halfvolle melk', 'en:netherlands', 'nl', '0.2.0')
is('the older search is full text, one page of 20', older.startsWith('https://world.openfoodfacts.org/cgi/search.pl?search_terms=halfvolle%20melk&search_simple=1&action=process&json=1&page_size=20'), true)
is('and filters on the country by name', older.includes('tagtype_0=countries&tag_contains_0=contains&tag_0=netherlands'), true)
is('a lookup asks only for what is shown', productUrl('8710496979125', 'nl', '0.2.0').includes('fields=code%2Cproduct_name%2Cbrands'), true)
is('a lookup uses the current product API (v3)', productUrl('8710496979125', 'nl', '0.2.0').startsWith('https://world.openfoodfacts.org/api/v3/product/8710496979125?'), true)
is('and asks for the Nutri-Score and the table basis', ['nutriscore_grade', 'nutrition_data_per'].every((f) => decodeURIComponent(productUrl('8710496979125', 'nl', '0.2.0')).includes(f)), true)
is('the app names itself as Open Food Facts asks', USER_AGENT, 'Hemlo/16 (contact via app)')
is('a v3 answer with a product is found', lookupFound({ code: '8710496979125', status: 'success', product: { code: '8710496979125' } }), true)
is('a v3 failure is not found', lookupFound({ status: 'failure', result: { id: 'product_not_found' } }), false)
is('a v2 "status 0" is not found', lookupFound({ status: 0, status_verbose: 'product not found' }), false)
is('nothing is not found', [lookupFound(null), lookupFound('x')], [false, false])
is('prices newest first', pricesUrl('8710496979125'), 'https://prices.openfoodfacts.org/api/v1/prices?product_code=8710496979125&order_by=-date&size=20')

// Nutrition per 100 g.
is('kcal as given', kcalOf({ 'energy-kcal_100g': 428, 'energy-kj_100g': 1779 }), 428)
is('only kJ: worked out', kcalOf({ 'energy-kj_100g': 1779 }), 425)
is('plain energy is kJ', kcalOf({ energy_100g: 418.4 }), 100)
is('none given is unknown, not 0', kcalOf({}), null)
is('figures written as text are read', kcalOf({ 'energy-kcal_100g': '52,5' }), 53)
is('a figure past what 100 g can hold is unknown', kcalOf({ 'energy-kcal_100g': 4280 }), null)
is('the five figures, fibre as Open Food Facts spells it', per100Of({
  'energy-kcal_100g': 435, proteins_100g: 5, carbohydrates_100g: 67, fat_100g: 15, fiber_100g: 7, salt_100g: 0.3, sugars_100g: 64,
}), { kcal: 435, protein_g: 5, carbs_g: 67, fat_g: 15, fiber_g: 7 })
is('other fibre spellings', per100Of({ fibre_100g: 3.25 }).fiber_g, 3.3)
is('missing values stay unknown', per100Of({ proteins_100g: 2.5 }), { kcal: null, protein_g: 2.5, carbs_g: null, fat_g: null, fiber_g: null })
is('no nutrition at all', per100Of(undefined), { kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null })
is('per serving only is not per 100 g', per100Of({ 'energy-kcal_serving': 87, proteins_serving: 1 }).kcal, null)
is('below zero is a typo', per100Of({ fat_100g: -1 }).fat_g, null)

// The rest of the EU label (PROD-03).
is('every EU field the pack has', euOf({
  'energy-kcal_100g': 428, 'energy-kj_100g': 1779, 'saturated-fat_100g': 9.1, 'monounsaturated-fat_100g': 4.2, 'polyunsaturated-fat_100g': 0.55,
  sugars_100g: 64, polyols_100g: 0, starch_100g: 2.04, salt_100g: 0.02,
}), { kj: 1779, sat_fat_g: 9.1, mufa_g: 4.2, pufa_g: 0.6, sugars_g: 64, polyols_g: 0, starch_g: 2, salt_g: 0.02, alcohol_g: null })
is('kJ worked out from kcal when only kcal is given', euOf({ 'energy-kcal_100g': 100 }).kj, 418)
is('plain energy is kJ', euOf({ energy_100g: 1500 }).kj, 1500)
is('salt from sodium (× 2.5) when salt is missing', euOf({ sodium_100g: 0.4 }).salt_g, 1)
is('salt as given wins over sodium', euOf({ salt_100g: 0.3, sodium_100g: 0.4 }).salt_g, 0.3)
is('alcohol in % vol becomes grams (× 0.789)', euOf({ alcohol_100g: 5, alcohol_unit: '% vol' }).alcohol_g, 3.9)
is('alcohol already in grams stays', euOf({ alcohol_100g: 4, alcohol_unit: 'g' }).alcohol_g, 4)
is('nothing known is all unknown, never 0', euOf(undefined), { kj: null, sat_fat_g: null, mufa_g: null, pufa_g: null, sugars_g: null, polyols_g: null, starch_g: null, salt_g: null, alcohol_g: null })
is('a saturates figure past 100 g is a typo', euOf({ 'saturated-fat_100g': 140 }).sat_fat_g, null)
is('Nutri-Score when there is one', [nutriScoreOf({ nutriscore_grade: 'B' }), nutriScoreOf({ nutrition_grades: 'e' })], ['b', 'e'])
is('no Nutri-Score for "unknown" or "not-applicable"', [nutriScoreOf({ nutriscore_grade: 'unknown' }), nutriScoreOf({ nutriscore_grade: 'not-applicable' }), nutriScoreOf({})], [null, null, null])
const rows = labelRows({ per100: { kcal: 428, protein_g: 5, carbs_g: 67, fat_g: 15, fiber_g: null }, eu: euOf({ 'energy-kj_100g': 1779, 'saturated-fat_100g': 9, sugars_100g: 64, salt_100g: 0.02 }) })
is('the table in the order of the EU label', rows.map((r) => r.label), ['Energy', 'Fat', 'of which saturates', 'Carbohydrate', 'of which sugars', 'Fibre', 'Protein', 'Salt'])
is('energy in kJ and kcal', rows[0].value, '1779 kJ / 428 kcal')
is('a required figure that is unknown shows a dash', rows.find((r) => r.key === 'fibre').value, '–')
is('the "of which" lines are indented', rows.filter((r) => r.sub).map((r) => r.key), ['sat', 'sugars'])
is('optional figures appear when given', labelRows({ per100: { kcal: 40, protein_g: 0, carbs_g: 3, fat_g: 0, fiber_g: 0 }, eu: euOf({ alcohol_100g: 5 }) }).map((r) => r.key).includes('alcohol'), true)

// Pack sizes.
is('"390 gram"', readQuantity('390 gram'), { amount: 390, unit: 'g' })
is('"250g"', readQuantity('250g'), { amount: 250, unit: 'g' })
is('"1 kg"', readQuantity('1 kg'), { amount: 1000, unit: 'g' })
is('"1,5 l"', readQuantity('1,5 l'), { amount: 1500, unit: 'ml' })
is('"33 cl"', readQuantity('33 cl'), { amount: 330, unit: 'ml' })
is('"6 x 50 g" is the whole pack', readQuantity('6 x 50 g'), { amount: 300, unit: 'g' })
is('"12 eggs" is no weight', readQuantity('12 eggs'), null)
is('nothing printed', readQuantity(null), null)
is('Open Food Facts’ own figure first', packOf({ product_quantity: 390, product_quantity_unit: 'g', quantity: '390 gram' }), { amount: 390, unit: 'g' })
is('millilitres stay millilitres', packOf({ product_quantity: '1000', product_quantity_unit: 'ml' }), { amount: 1000, unit: 'ml' })
is('another unit falls back to the printed text', packOf({ product_quantity: 6, product_quantity_unit: 'pcs', quantity: '6 stuks' }), null)
is('an older entry without a unit reads the text', packOf({ product_quantity: 1500, quantity: '1,5 l' }), { amount: 1500, unit: 'ml' })

// Shop names.
is('"Ah" is Albert Heijn', storeName('Ah'), 'Albert Heijn')
is('tags with a language are read', storeName('en:albert-heijn'), 'Albert Heijn')
is('Dirk by its long name', storeName('dirk-van-den-broek'), 'Dirk')
is('known chains keep their own spelling', [storeName('JUMBO'), storeName('lidl'), storeName('Dekamarkt'), storeName('sainsbury-s')], ['Jumbo', 'Lidl', 'DekaMarkt', 'Sainsbury’s'])
is('an unknown tag gets capitals', storeName('bakkerij-de-graaf'), 'Bakkerij De Graaf')
is('an unknown name keeps what was typed', storeName('Marqt Utrecht'), 'Marqt Utrecht')
is('empty is no shop', storeName('  '), null)
is('no repeats, tags and text together', storesOf({ stores_tags: ['Ah', 'jumbo'], stores: 'Albert Heijn, Jumbo, Lidl' }), ['Albert Heijn', 'Jumbo', 'Lidl'])
is('at most 20 shops', storesOf({ stores: Array.from({ length: 30 }, (_, i) => `Shop ${i}`) }).length, 20)
is('pictures only from Open Food Facts over https', [
  safeImage('https://images.openfoodfacts.org/images/products/871/049/697/9125/front_en.4.200.jpg') !== null,
  safeImage('http://images.openfoodfacts.org/x.jpg'), safeImage('https://evil.example/x.jpg'), safeImage(`https://images.openfoodfacts.org/${'x'.repeat(600)}`),
], [true, null, null, null])

// A product from a barcode lookup (world.openfoodfacts.org/api/v2/product).
const lookup = {
  brands: 'De Ruijter', code: '8710496979125', countries_tags: ['en:netherlands'],
  image_front_small_url: 'https://images.openfoodfacts.org/images/products/871/049/697/9125/front_en.4.200.jpg',
  product_name: 'Chocoladehagel puur', product_name_nl: 'Chocoladehagel puur', product_quantity: 390, product_quantity_unit: 'g',
  quantity: '390 gram', stores: 'Ah', stores_tags: ['Ah'], categories_tags: ['en:spreads', 'en:bread-coverings', 'en:chocolate-sprinkles'],
  nutriments: { 'energy-kcal_100g': 428, 'energy-kj_100g': 1779, carbohydrates_100g: 67, fat_100g: 15, proteins_100g: 5, salt_100g: 0.02, sugars_100g: 64 },
}
const hagel = readProduct(lookup, 'nl')
is('a looked-up product', hagel, {
  code: '8710496979125', name: 'Chocoladehagel puur', brand: 'De Ruijter', quantity: '390 gram', pack: 390, packUnit: 'g',
  stores: ['Albert Heijn'], per100: { kcal: 428, protein_g: 5, carbs_g: 67, fat_g: 15, fiber_g: null },
  image: lookup.image_front_small_url, categories: ['en:spreads', 'en:bread-coverings', 'en:chocolate-sprinkles'],
  eu: { kj: 1779, sat_fat_g: null, mufa_g: null, pufa_g: null, sugars_g: 64, polyols_g: null, starch_g: null, salt_g: 0.02, alcohol_g: null },
  perMl: false, nutriScore: null,
})
is('a drink sold in ml has its figures per 100 ml', readProduct({ code: '8710496979125', product_quantity: 1000, product_quantity_unit: 'ml' }).perMl, true)
is('unless the table says per 100 g', readProduct({ code: '8710496979125', product_quantity: 1000, product_quantity_unit: 'ml', nutrition_data_per: '100g' }).perMl, false)
is('a Nutri-Score is read with the product', readProduct({ ...lookup, nutriscore_grade: 'e' }).nutriScore, 'e')
is('the name in the country’s language first', readProduct({ code: '8710496979125', product_name: 'Chocolate sprinkles', product_name_nl: 'Hagelslag' }, 'nl').name, 'Hagelslag')
is('else the product’s own name', readProduct({ code: '8710496979125', product_name: 'Vermicelles', product_name_nl: '' }, 'nl').name, 'Vermicelles')
is('the first of several brands', readProduct({ code: '8710496979125', brands: 'boni, colruyt' }).brand, 'boni')
is('a product without a barcode is dropped', readProduct({ product_name: 'x' }), null)
is('nor with a bad one', readProduct({ code: '8710496979126' }), null)
is('no name: brand and barcode', displayName({ name: null, brand: 'Jumbo', code: '8718452778485' }), 'Jumbo 8718452778485')
is('no name, no brand', displayName({ name: null, brand: null, code: '8718452778485' }), 'Product 8718452778485')

// Both searches (search.openfoodfacts.org's "hits" and the older "products").
const hits = { hits: [
  { code: '8710400002970', brands: ['Albert Heijn'], stores: ['Albert Heijn'], quantity: '250 g', product_name: 'Puur Hagelslag', product_name_nl: 'Puur Hagelslag',
    nutriments: { 'energy-kcal_100g': 435, fiber_100g: 7 } },
  { code: '8710400002970', product_name: 'a repeat' },
  { code: 'nope', product_name: 'no barcode' },
  { code: '8718452778485', brands: ['Jumbo'], product_name: 'Chocolade hagelslag', nutriments: { 'energy-kj_100g': 1879 } },
] }
const found = readSearch(hits, 'nl')
is('the newer search: repeats and bad barcodes go', found.map((p) => p.code), ['8710400002970', '8718452778485'])
is('brands as a list', found[0].brand, 'Albert Heijn')
is('kJ only still gives kcal', found[1].per100.kcal, 449)
const legacy = readSearch({ count: 290, products: [{ code: '4056489340607', product_name: 'pindakaas met stukjes noot', brands: 'Lidl', stores_tags: ['Lidl'], quantity: '600 gram', product_quantity: '600', product_quantity_unit: 'g' }] })
is('the older search', [legacy[0].name, legacy[0].stores, legacy[0].pack], ['pindakaas met stukjes noot', ['Lidl'], 600])
is('an answer that is not a search', readSearch({ error: 'x' }), [])

// As a food.
is('aisle from the categories', [sectionOf(['en:spreads']), sectionOf(['en:frozen-foods', 'en:vegetables']), sectionOf([])], ['Spreads', 'Frozen', null])
is('state from the categories', [stateOf(['en:frozen-foods']), stateOf(['en:canned-foods']), stateOf([])], ['frozen', 'canned', 'raw'])
is('the food row a product becomes', foodFields(hagel, 'user-a'), {
  owner_id: 'user-a', name: 'Chocoladehagel puur', brand: 'De Ruijter', kcal: 428, protein_g: 5, carbs_g: 67, fat_g: 15, fiber_g: null,
  kj: 1779, sugars_g: 64, salt_g: 0.02, per_ml: false, carb_basis: 'eu',
  state: 'raw', cook_yield: null, pack_size_g: 390, store_section: 'Spreads', stores: ['Albert Heijn'],
  barcode: '8710496979125', source: 'off', source_ref: '8710496979125', image_url: lookup.image_front_small_url, deleted_at: null,
})
const mine = { id: 'f1', owner_id: 'user-a', name: 'Chocoladehagel puur', barcode: '8710496979125', brand: 'De Ruijter', kcal: '428.00', protein_g: 5,
  carbs_g: 67, fat_g: 15, fiber_g: null, pack_size_g: '390.00', stores: ['Albert Heijn'], image_url: null, deleted_at: null }
is('a kept food shown as a product (numbers from Postgres as text)', productFromFood(mine), {
  code: '8710496979125', name: 'Chocoladehagel puur', brand: 'De Ruijter', quantity: null, pack: 390, packUnit: 'g', stores: ['Albert Heijn'],
  per100: { kcal: 428, protein_g: 5, carbs_g: 67, fat_g: 15, fiber_g: null }, image: null, categories: [],
  eu: { kj: null, sat_fat_g: null, mufa_g: null, pufa_g: null, sugars_g: null, polyols_g: null, starch_g: null, salt_g: null, alcohol_g: null },
  perMl: false,
})
is('a kept food’s EU figures come back with it', productFromFood({ ...mine, salt_g: '0.02', sugars_g: 64, per_ml: true }).eu.salt_g, 0.02)
is('and a drink stays per ml', productFromFood({ ...mine, per_ml: true }).packUnit, 'ml')
is('a food without a barcode is not a product', productFromFood({ ...mine, barcode: null }), null)

// The pack's serving as the food's unit (022).
const bar = readProduct({ ...lookup, serving_size: '1 bar (30 g)', serving_quantity: 30 }, 'nl')
is('a serving is read', bar.serving, { name: 'bar', g: 30 })
is('and becomes the food’s unit', foodFields(bar, 'user-a').units, [{ name: 'bar', g: 30 }])
is('two biscuits a serving are biscuits', readProduct({ code: '8710496979125', serving_size: '2 biscuits (25 g)' }).serving,
  { name: 'biscuit', plural: 'biscuits', g: 12.5 })
is('grams alone are a portion', readProduct({ code: '8710496979125', serving_size: '30g', serving_quantity: '30' }).serving, { name: 'portion', g: 30 })
is('no serving, no unit', 'units' in foodFields(hagel, 'user-a'), false)
is('a kept food’s unit shows as its serving', productFromFood({ ...mine, units: [{ name: 'bar', g: 30 }] }).serving, { name: 'bar', g: 30 })
const foods = [
  { id: 'gone', owner_id: 'user-a', barcode: '8710496979125', deleted_at: '2026-09-01T00:00:00Z' },
  { id: 'other', owner_id: 'user-b', barcode: '8710496979125', deleted_at: null },
  mine,
]
is('the person’s own food with that barcode', foodWithBarcode(foods, '8710496979125', 'user-a')?.id, 'f1')
is('someone else’s is never theirs', foodWithBarcode(foods.slice(0, 2), '8710496979125', 'user-a'), null)
is('a shared one is used when there is no own one', foodWithBarcode([{ id: 's', owner_id: null, barcode: '23029187' }], '23029187', 'user-a')?.id, 's')
is('stored in another spelling still matches', foodWithBarcode([{ id: 'u', owner_id: 'user-a', barcode: '036000291452' }], '0036000291452', 'user-a')?.id, 'u')
is('a deleted own food is found to bring back', deletedWith(foods, '8710496979125', 'user-a')?.id, 'gone')
is('not someone else’s', deletedWith(foods, '8710496979125', 'user-b'), null)

// Into stock.
is('packs times the pack size', stockGrams('2', 'packs', 390), 780)
is('half a pack, with a comma', stockGrams('0,5', 'packs', 390), 195)
is('packs without a pack size is no amount', stockGrams('1', 'packs', null), null)
is('grams as typed', stockGrams('450', 'g', 390), 450)
is('kilos', stockGrams('1,2', 'kg', null), 1200)
is('nothing or nonsense is no amount', [stockGrams('', 'g', 390), stockGrams('lots', 'packs', 390), stockGrams('0', 'packs', 390), stockGrams('-1', 'g', 390)], [null, null, null, null])
is('past the cupboard’s cap is no amount', stockGrams('3000', 'packs', 390), null)

// Prices (prices.openfoodfacts.org/api/v1/prices).
is('a day as people write it', [formatDay('2024-04-26'), formatDay('2026-09-01T10:00:00Z'), formatDay(null), formatDay('2024-13-01')], ['26 Apr 2024', '1 Sep 2026', null, null])
is('euros', formatPrice(2.65, 'EUR'), '€2.65')
is('pounds', formatPrice(1.2, 'GBP'), '£1.20')
is('a currency with no symbol keeps its code', formatPrice(3.49, 'PLN').replace(/ /g, ' '), 'PLN 3.49')
is('a made-up currency still shows', formatPrice(3.49, 'QQQ').replace(/ /g, ' ').includes('3.49'), true)
is('per kilo from a 390 g pack', perUnitLabel(2.65, 'EUR', 390, 'g', null), '€6.79/kg')
is('per litre from a 1.5 l bottle', perUnitLabel(1.5, 'EUR', 1500, 'ml', 'UNIT'), '€1.00/l')
is('a price already per kilo', perUnitLabel(2.99, 'EUR', null, null, 'KILOGRAM'), '€2.99/kg')
is('no pack size, no per kilo', perUnitLabel(2.65, 'EUR', null, null, null), null)
const ede = { id: 377, osm_name: 'Albert Heijn', osm_address_city: 'Ede', osm_address_country: 'Nederland' }
const prices = readPrices({ items: [
  { price: 2.65, currency: 'EUR', date: '2024-04-26', created: '2024-04-26T10:00:00Z', location_id: 377, location: ede, price_is_discounted: false },
  { price: 2.49, currency: 'EUR', date: '2024-02-01', created: '2024-02-01T10:00:00Z', location_id: 377, location: ede },
  { price: 2.19, currency: 'EUR', date: '2025-01-10', created: '2025-01-10T10:00:00Z', location_id: 12, price_is_discounted: true,
    location: { osm_name: 'Jumbo', osm_address_city: 'Venlo' } },
  { price: null, currency: 'EUR', date: '2025-03-01', location_id: 13, location: { osm_name: 'Lidl' } },
  { price: 1.99, currency: null, date: '2025-03-01', location_id: 14, location: { osm_name: 'Plus' } },
  { price: 1.89, currency: 'EUR', date: null, location_id: 15, location: { type: 'ONLINE', website_url: 'https://www.ah.nl/' } },
] }, 390, 'g')
is('the latest per shop, newest first; no amount or currency left out', prices.map((r) => [r.shop, r.city, r.label, r.date]),
  [['Jumbo', 'Venlo', '€2.19', '2025-01-10'], ['Albert Heijn', 'Ede', '€2.65', '2024-04-26'], ['ah.nl', null, '€1.89', null]])
is('offers are marked', prices.map((r) => r.offer), [true, false, false])
is('per kilo on each', prices[1].perUnit, '€6.79/kg')
is('no prices shared yet', readPrices({ items: [], total: 0 }, 390, 'g'), [])
is('an answer that is not prices', readPrices('oops', null, null), [])

// Staying within the limits.
const limiter = new RateLimiter(LIMITS.search.limit, LIMITS.search.windowMs)
is('fewer than Open Food Facts allows', [LIMITS.search.limit <= 10, LIMITS.product.limit <= 15, LIMITS.prices.limit <= 15], [true, true, true])
for (let i = 0; i < 8; i++) limiter.take(1000 + i * 1000)
is('eight searches in a minute may go', limiter.waitFor(8500), 60_000 - 7500)
is('the ninth waits until the first is a minute old', limiter.waitFor(60_999), 1)
is('and then goes', limiter.waitFor(61_000), 0)
const quick = new RateLimiter(2, 1000)
quick.take(0)
is('under the limit, no wait', quick.waitFor(10), 0)

const cache = new TtlCache(3)
cache.set('a', 1, TTL.search, 0)
is('an answer is reused', cache.get('a', 1000), { value: 1 })
is('until it is too old', cache.get('a', TTL.search), undefined)
cache.set('n', null, TTL.missing, 0)
is('"not found" is remembered too', cache.get('n', 10), { value: null })
is('but asked again sooner than a product', TTL.missing < TTL.product, true)
cache.set('b', 2, 1000, 0); cache.set('c', 3, 1000, 0); cache.set('d', 4, 1000, 0)
is('the oldest goes when it is full', [cache.get('n', 1), cache.get('d', 1)], [undefined, { value: 4 }])
is('it never holds more than asked', cache.size, 3)

console.log(fail ? `\n${fail} check(s) failed` : '\nall product checks passed')
process.exit(fail ? 1 : 0)
