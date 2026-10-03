// Checks the shopping list's rules: reading what is typed, matching it to a
// food, aisles (guessed, renamed, ordered per shop), what the plan and the
// cupboard put on the list, the shop filter and the grouping, merging, the
// recently bought tiles, prices and the trip's total, the window of meals,
// the trip task on the plan, and the chains offered in Stores.
import {
  parseItem, parseAmount, amountText, entryGrams, cleanName, nameKey, itemKey, matchFood, guessAisle, readAisles, resolveAisle,
  renameAisle, addAisle, removeAisle, moveInList, sortAisles, shopAisles, planNeeds, plannedLines, boughtFor, doneGrams,
  forShop, sameShop, onList, groupList, reorderWithin, nextSort, mergeAmounts, recentTiles, currencyFor, formatMoney,
  readPrice, perKilo, priceLabel, itemCost, tripTotal, pickPrice, nextShoppingDay, listWindow, describeDays, tripTitle,
  planTrip, listNames, windowText, isTripTask, readShoppingModule, DEFAULT_AISLES, OTHER,
} from '../lib/shopping-rules.ts'
import { suggestShops, cleanShopName, CHAINS } from '../lib/shops-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---- reading what is typed ----------------------------------------------------------
is('a weight in front', parseItem('2 kg apples'), { name: 'Apples', qty: 2, unit: 'kg', grams: 2000 })
is('a bare count', parseItem('6 eggs'), { name: 'Eggs', qty: 6, unit: null, grams: null })
is('no amount at all', parseItem('toilet paper'), { name: 'Toilet paper', qty: null, unit: null, grams: null })
is('the unit stuck to the number', parseItem('500g mince'), { name: 'Mince', qty: 500, unit: 'g', grams: 500 })
is('a comma as the decimal point', parseItem('1,5 l milk'), { name: 'Milk', qty: 1.5, unit: 'l', grams: 1500 })
is('centilitres count as grams of drink', parseItem('75 cl wine'), { name: 'Wine', qty: 75, unit: 'ml', grams: 750 })
is('a half', parseItem('½ kg cheese'), { name: 'Cheese', qty: 0.5, unit: 'kg', grams: 500 })
is('"of" is dropped', parseItem('2 packs of rice'), { name: 'Rice', qty: 2, unit: 'pack', grams: null })
is('a shop word in Dutch', parseItem('3 flessen water'), { name: 'Water', qty: 3, unit: 'bottle', grams: null })
is('2x in front', parseItem('2x yoghurt'), { name: 'Yoghurt', qty: 2, unit: null, grams: null })
is('2 x in front', parseItem('2 x yoghurt'), { name: 'Yoghurt', qty: 2, unit: null, grams: null })
is('a dozen', parseItem('a dozen eggs'), { name: 'Eggs', qty: 12, unit: null, grams: null })
is('half a dozen', parseItem('half a dozen eggs'), { name: 'Eggs', qty: 6, unit: null, grams: null })
is('the amount after the name', parseItem('apples 2 kg'), { name: 'Apples', qty: 2, unit: 'kg', grams: 2000 })
is('after a comma', parseItem('apples, 2kg'), { name: 'Apples', qty: 2, unit: 'kg', grams: 2000 })
is('times after the name', parseItem('milk x2'), { name: 'Milk', qty: 2, unit: null, grams: null })
is('a bare number after a comma', parseItem('bananas, 6'), { name: 'Bananas', qty: 6, unit: null, grams: null })
is('a number inside a name is the name', parseItem('7up'), { name: '7up', qty: null, unit: null, grams: null })
is('a number that ends a name stays in it', parseItem('Vitamin B 12'), { name: 'Vitamin B 12', qty: null, unit: null, grams: null })
is('an unknown word after a number is the name', parseItem('3 apples'), { name: 'Apples', qty: 3, unit: null, grams: null })
is('spaces tidied, first letter a capital', parseItem('   peanut   butter  '), { name: 'Peanut butter', qty: null, unit: null, grams: null })
is('nothing typed is nothing', parseItem('   '), null)
is('an amount with no name is a name', parseItem('2 kg'), { name: '2 kg', qty: null, unit: null, grams: null })
is('zero is not an amount', parseItem('0 eggs'), { name: '0 eggs', qty: null, unit: null, grams: null })
is('past what the database holds is not an amount', parseItem('2000 kg flour'), { name: '2000 kg flour', qty: null, unit: null, grams: null })
is('a long name is cut to 120', parseItem('x'.repeat(200)).name.length, 120)
is('cleanName drops a trailing full stop', cleanName('bread.'), 'Bread')

is('an amount on its own', [parseAmount('2 kg'), parseAmount('6'), parseAmount('2 packs'), parseAmount('')],
  [{ qty: 2, unit: 'kg', grams: 2000 }, { qty: 6, unit: null, grams: null }, { qty: 2, unit: 'pack', grams: null }, { qty: null, unit: null, grams: null }])
is('not an amount', [parseAmount('lots'), parseAmount('2 bananas'), parseAmount('-1')], [null, null, null])
is('a weight as shown', amountText({ qty: 2, unit: 'kg', grams: 2000 }), '2 kg')
is('a shop word as shown', amountText({ qty: 2, unit: 'pack' }), '2 packs')
is('one of a shop word', amountText({ qty: 1, unit: 'bottle' }), '1 bottle')
is('a bare count', amountText({ qty: 6, unit: null }), '6')
is('a bare count of a food counted in eggs', amountText({ qty: 6, unit: null }, [{ name: 'egg', g: 50 }]), '6 eggs')
is('no amount is empty', amountText({ qty: null, unit: null }), '')
is('grams alone', amountText({ qty: null, grams: 450 }), '450 g')

const egg = { units: [{ name: 'egg', g: 50 }], pack_size_g: null }
is('a count of eggs comes to grams', entryGrams({ qty: 6, unit: null }, egg), 300)
is('packs of a food with a pack size', entryGrams({ qty: 2, unit: 'pack' }, { units: [], pack_size_g: 500 }), 1000)
is('a weight is its own grams', entryGrams({ qty: 2, unit: 'kg', grams: 2000 }, undefined), 2000)
is('a count of something unweighed is not grams', entryGrams({ qty: 3, unit: null }, { units: [], pack_size_g: null }), null)

// ---- matching to a food ----------------------------------------------------------------
is('plural and singular are one item', nameKey('Eggs'), nameKey('egg'))
is('what is in brackets does not count', nameKey('Rice (cooked)'), 'rice')
is('accents and case do not count', nameKey('Crème fraîche'), 'creme fraiche')
is('an item is its food', itemKey({ food_id: 'f1', name: 'Eggs' }), 'f1')
is('or its name', itemKey({ food_id: null, name: 'Toilet Paper' }), 'name:toilet paper')
const foods = [
  { id: 'cat-egg', name: 'Egg' }, { id: 'cat-apple', name: 'Apple Rose' }, { id: 'my-milk', name: 'Milk semi-skimmed', mine: true },
  { id: 'cat-milk', name: 'Milk Whole' }, { id: 'my-egg', name: 'Eggs', mine: true },
]
is('the same name matches, the person\'s own first', matchFood('6 eggs'.slice(2), foods), 'my-egg')
is('one\'s own food that starts with it', matchFood('milk', foods), 'my-milk')
is('a catalogue food that only starts with it does not', matchFood('apple', foods), null)
is('nothing that fits is no food', matchFood('toilet paper', foods), null)

// ---- aisles -------------------------------------------------------------------------
is('fruit', guessAisle('Apples'), 'Fruit and veg')
is('Dutch fruit', guessAisle('appels'), 'Fruit and veg')
is('dairy', guessAisle('Eggs'), 'Dairy')
is('a phrase wins', guessAisle('Peanut butter'), 'Spreads')
is('frozen is frozen', guessAisle('Frozen peas'), 'Frozen')
is('the last word names the thing', guessAisle('Chocolate milk'), 'Dairy')
is('household things', guessAisle('Toilet paper'), 'Household')
is('a Dutch compound', guessAisle('volkorenbrood'), 'Bakery')
is('a name that says nothing', guessAisle('Thing'), null)

const a0 = readAisles(undefined)
is('the default aisles', a0.aisles, DEFAULT_AISLES)
is('Other is always there', readAisles({ aisles: ['Bakery', 'Dairy'] }).aisles, ['Bakery', 'Dairy', OTHER])
is('doubles and blanks dropped', readAisles({ aisles: ['Dairy', ' dairy ', '', 'Bakery'] }).aisles, ['Dairy', 'Bakery', OTHER])
const renamed = renameAisle(a0, 'Dairy', 'Zuivel')
is('a renamed aisle keeps its place', renamed.aisles[4], 'Zuivel')
is('items guessed into the old name show under the new', resolveAisle('Dairy', renamed), 'Zuivel')
is('renamed twice still lands', resolveAisle('Dairy', renameAisle(renamed, 'Zuivel', 'Milk and eggs')), 'Milk and eggs')
is('a rename onto another aisle is refused', renameAisle(a0, 'Dairy', 'bakery'), a0)
is('Other cannot be renamed', renameAisle(a0, OTHER, 'Rest'), a0)
is('a new aisle goes before Other', addAisle(a0, 'Asian').aisles.slice(-2), ['Asian', OTHER])
is('an aisle already there is not added', addAisle(a0, 'dairy'), a0)
const removed = removeAisle(a0, 'Fish')
is('a removed aisle is gone from the order', removed.aisles.includes('Fish'), false)
is('its items go under Other', resolveAisle('Fish', removed), OTHER)
is('a loop of renames ends', resolveAisle('A', { renamed: { A: 'B', B: 'A' } }) !== undefined, true)
is('move up', moveInList(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c'])
is('move past the end does nothing', moveInList(['a', 'b'], 1, 1), ['a', 'b'])
is('aisles in walking order, unknown after, Other last', sortAisles([OTHER, 'Zebra', 'Dairy', 'Bakery'], DEFAULT_AISLES), ['Bakery', 'Dairy', 'Zebra', OTHER])
is('a shop\'s own order first, the rest after', shopAisles({ aisles: ['Drinks', 'Dairy'] }, a0).slice(0, 3), ['Drinks', 'Dairy', 'Fruit and veg'])
is('a shop order follows renames', shopAisles({ aisles: ['Dairy'] }, renamed)[0], 'Zuivel')

// ---- what the plan and the cupboard put on the list ---------------------------------------
const F = new Map([
  ['rice', { id: 'rice', name: 'Rice', pack_size_g: 1000, cook_yield: 2.5, units: null }],
  ['egg', { id: 'egg', name: 'Egg Chicken', pack_size_g: null, cook_yield: null, units: [{ name: 'egg', g: 50 }] }],
  ['oil', { id: 'oil', name: 'Olive oil', pack_size_g: null, cook_yield: null, units: null }],
  ['yog', { id: 'yog', name: 'Greek yoghurt', pack_size_g: 500, cook_yield: null, units: null }],
])
const lines = new Map([
  ['r1', [
    { id: 'l1', recipe_id: 'r1', food_id: 'rice', raw_text: 'Brown rice (cooked)', grams_per_portion: 250, state: 'cooked', sort_order: 0 },
    { id: 'l2', recipe_id: 'r1', food_id: 'egg', raw_text: 'eggs', grams_per_portion: 100, state: null, unit: 'egg', unit_qty: 2, sort_order: 1 },
    { id: 'l3', recipe_id: 'r1', food_id: null, raw_text: 'salt', grams_per_portion: 1, state: null, sort_order: 2 },
  ]],
])
const slot = (over) => ({ slot_date: '2026-10-03', status: 'planned', recipe_id: null, portion_multiplier: 1, food_id: null, grams: null, deleted_at: null, ...over })
const needs = planNeeds([
  slot({ recipe_id: 'r1' }),
  slot({ recipe_id: 'r1', slot_date: '2026-10-04', portion_multiplier: 2 }),
  slot({ recipe_id: 'r1', status: 'eaten' }),
  slot({ recipe_id: 'r1', slot_date: '2026-10-09' }),
  slot({ food_id: 'yog', grams: 150 }),
  slot({ label: 'sandwich', kcal: 400 }),
], lines, F, '2026-10-03', '2026-10-06')
const need = (id) => needs.find((n) => n.food_id === id)
is('cooked grams are bought raw, times the portions', need('rice').grams, 300)
is('a count kept while every meal used one unit', need('egg').count, { qty: 6, unit: { name: 'egg' } })
is('the recipe\'s word, without the cooking note', need('rice').said, 'Brown rice')
is('a meal of one food counts too', need('yog').grams, 150)
is('meals eaten, outside the window or typed as numbers need nothing', needs.length, 3)
is('how many meals use it', need('egg').meals, 2)

const stock = new Map([['rice', { grams: 100, min: null }], ['oil', { grams: 100, min: 500 }], ['egg', { grams: 0, min: null }]])
const pl = plannedLines(needs, stock, F)
const line = (id) => pl.find((l) => l.food_id === id)
is('stock is taken off', line('rice').buy_g, 200)
is('whole packs where the pack size is known', line('rice').amount, '1 pack (1 kg)')
is('a counted food in whole ones', line('egg').amount, '6 eggs')
is('a minimum on its own puts the food on the list', line('oil').buy_g, 400)
is('and says why', line('oil').why, 'keeps 500 g in')
is('a drink in litres', plannedLines([], new Map([['oj', { grams: 0, min: 1500 }]]), new Map([['oj', { id: 'oj', name: 'Juice', per_ml: true, units: null }]]))[0].amount, '1.5 l')
is('the plan says why', line('egg').why, 'for 2 meals')
is('a minimum adds to what the plan needs', plannedLines(needs, new Map([['egg', { grams: 100, min: 100 }]]), F).find((l) => l.food_id === 'egg').buy_g, 300)
is('a minimum that is met adds nothing on its own', plannedLines([], new Map([['oil', { grams: 600, min: 500 }]]), F), [])
is('dealt-with grams count as bought', plannedLines(needs, new Map(), F, new Map([['rice', 300]])).some((l) => l.food_id === 'rice'), false)
is('a part dealt with leaves the rest', plannedLines(needs, new Map(), F, new Map([['egg', 200]])).find((l) => l.food_id === 'egg').amount, '2 eggs')
is('bought packs go in whole', boughtFor(line('rice')), 1000)
is('bought eggs go in as whole eggs', boughtFor(line('egg')), 300)
is('else what was left to buy', boughtFor(line('oil')), 400)
is('dealt with until a day', [...doneGrams([
  { plan_key: 'rice', done_until: '2026-10-05', grams: 200, deleted_at: null },
  { plan_key: 'egg', done_until: '2026-10-01', grams: 100, deleted_at: null },
  { plan_key: null, done_until: '2026-10-05', grams: 1, deleted_at: null },
], '2026-10-03')], [['rice', 200]])

// ---- the shop filter, lists and the grouping ----------------------------------------------
is('shop names compare loosely', sameShop('albert heijn', 'Albert Heijn'), true)
is('any shop shows everything', forShop({ shop: 'Lidl' }, null), true)
is('an item for another shop is hidden', forShop({ shop: 'Lidl' }, 'Jumbo'), false)
is('an item for no shop shows in every shop', forShop({ shop: null }, 'Jumbo'), true)
is('the main list', onList({ list: null }, null), true)
is('another list is not the main one', onList({ list: 'Me' }, null), false)
is('a list by name', onList({ list: 'me' }, 'Me'), true)
const item = (key, aisle, over = {}) => ({ key, kind: 'manual', entry: null, food_id: null, name: key, amount: '', grams: null, pieces: null, aisle, shop: null, sold_at: [], note: null, checked: false, list: null, why: '', sort: 0, ...over })
const g = groupList([item('milk', 'Dairy'), item('bread', 'Bakery'), item('soap', 'Odd'), item('eggs', 'Dairy', { sort: -1 }), item('done', 'Dairy', { checked: true })], DEFAULT_AISLES)
is('aisles in walking order', g.aisles.map((x) => x.aisle), ['Bakery', 'Dairy', 'Odd'])
is('within an aisle, the person\'s order', g.aisles[1].items.map((i) => i.key), ['eggs', 'milk'])
is('the basket apart', g.basket.map((i) => i.key), ['done'])
is('moving down swaps two and renumbers', reorderWithin([{ key: 'a', sort: 10 }, { key: 'b', sort: 10 }, { key: 'c', sort: 30 }], 'a', 1), [{ key: 'a', sort: 20 }])
is('moving past the top does nothing', reorderWithin([{ key: 'a', sort: 10 }], 'a', -1), [])
is('a new item goes last', nextSort([{ sort_order: 10 }, { sort_order: 40 }]), 50)
is('lists from the items and the kept names', listNames([{ list: 'me', deleted_at: null }, { list: null, deleted_at: null }, { list: 'Gone', deleted_at: 'x' }], ['Me', 'Party']), ['Me', 'Party'])

// ---- merging an item already on the list -----------------------------------------------
is('bare counts add', mergeAmounts({ qty: 6, unit: null, grams: null }, { qty: 6, unit: null, grams: null }), { qty: 12, unit: null, grams: null })
is('the same unit adds', mergeAmounts({ qty: 1, unit: 'kg', grams: 1000 }, { qty: 0.5, unit: 'kg', grams: 500 }), { qty: 1.5, unit: 'kg', grams: 1500 })
is('grams and kilos add in grams', mergeAmounts({ qty: 500, unit: 'g', grams: 500 }, { qty: 1, unit: 'kg', grams: 1000 }), { qty: 1.5, unit: 'kg', grams: 1500 })
is('an amount added to none is the amount', mergeAmounts({ qty: null, unit: null, grams: null }, { qty: 2, unit: 'pack', grams: null }), { qty: 2, unit: 'pack', grams: null })
is('packs and kilos stay apart', mergeAmounts({ qty: 2, unit: 'pack', grams: null }, { qty: 1, unit: 'kg', grams: 1000 }), null)

// ---- recently bought -------------------------------------------------------------------------
const bought = (name, at, over = {}) => ({ food_id: null, name, qty: null, unit: null, grams: null, aisle: null, shop: null, bought_at: at, plan_key: null, ...over })
const tiles = recentTiles([
  bought('Milk', '2026-09-01T10:00:00Z'), bought('milk', '2026-09-20T10:00:00Z', { qty: 2 }), bought('Bread', '2026-10-01T10:00:00Z'),
  bought('Soap', '2026-04-01T10:00:00Z'), bought('Never bought', null), bought('Eggs', '2026-10-02T10:00:00Z'),
  bought(null, '2026-10-02T10:00:00Z', { food_id: 'rice', plan_key: 'rice', grams: 900 }),
], new Set(['name:egg']), '2026-10-03T12:00:00Z', 12, new Map([['rice', 'Rice']]))
is('the most often bought first, then the most recent', tiles.map((t) => t.name), ['milk', 'Rice', 'Bread', 'Soap'])
is('one tap brings back the last amount', tiles[0].qty, 2)
is('a planned item comes back without the plan\'s amount', tiles[1].grams, null)
is('bought long ago counts as once more seen, not as often', tiles.find((t) => t.name === 'Soap').times, 0)

// ---- prices -----------------------------------------------------------------------------
is('euros in the Netherlands', currencyFor('NL'), 'EUR')
is('pounds in Britain', currencyFor('gb'), 'GBP')
is('euros when the country is not set', currencyFor(null), 'EUR')
is('money as written', formatMoney(2.5, 'EUR'), '€2.50')
is('a price typed with a comma', readPrice('2,49'), 2.49)
is('with a sign', readPrice('€ 1.5'), 1.5)
is('words are not a price', readPrice('cheap'), null)
is('three decimals are not a price', readPrice('1.999'), null)
is('per kilo from a pack', perKilo({ price: 2.49, amount_g: 500 }), 4.98)
is('a price for one has no per kilo', perKilo({ price: 1, amount_g: null }), null)
is('the label', priceLabel({ price: 2.49, amount_g: 500 }), '€2.49 for 500 g · €4.98 a kg')
is('the label for a drink', priceLabel({ price: 1.2, amount_g: 1500 }, 'EUR', true), '€1.20 for 1.5 l · €0.80 a litre')
is('a price for a kilo says so once', priceLabel({ price: 1.89, amount_g: 1000 }), '€1.89 a kg')
is('the label for one', priceLabel({ price: 0.99, amount_g: null }), '€0.99 each')
is('by weight', itemCost({ grams: 750, pieces: null }, { price: 4, amount_g: 1000 }), 3)
is('packs the plan rounds to', itemCost({ grams: 200, pieces: null, line: { packs: 1, pack_size_g: 1000 } }, { price: 1.89, amount_g: 1000 }), 1.89)
is('so many of a price for one', itemCost({ grams: null, pieces: 3 }, { price: 0.5, amount_g: null }), 1.5)
is('a weight price for an item of no weight cannot be said', itemCost({ grams: null, pieces: 2 }, { price: 4, amount_g: 1000 }), null)
is('the total of what is priced', tripTotal([item('a', 'x', { pieces: 2 }), item('b', 'x'), item('c', 'x')], (i) => (i.key === 'c' ? null : { price: 1.25, amount_g: null })), { total: 3.75, priced: 2, of: 3 })
const prices = [{ shop: 'Lidl', price: 1, amount_g: null, noted_on: '2026-09-01' }, { shop: 'Jumbo', price: 2, amount_g: null, noted_on: '2026-09-20' }]
is('the price at the chosen shop', pickPrice(prices, 'lidl').price, 1)
is('with no shop, the latest', pickPrice(prices, null).price, 2)
is('none at a shop with no price', pickPrice(prices, 'Aldi'), null)

// ---- the window and the trip -------------------------------------------------------------
// 3 October 2026 is a Saturday.
is('the next day, with no days chosen', nextShoppingDay('2026-10-03', []), '2026-10-04')
is('today, when today is a shopping day', nextShoppingDay('2026-10-03', [6]), '2026-10-03')
is('the next chosen weekday', nextShoppingDay('2026-10-03', [3]), '2026-10-07')
is('a day already done is passed over', nextShoppingDay('2026-10-03', [6], new Set(['2026-10-03'])), '2026-10-10')
is('four days by default', listWindow('2026-10-03', [], 4), { from: '2026-10-03', to: '2026-10-06' })
is('with shopping days: up to the day before the trip after next', listWindow('2026-10-01', [6], 4), { from: '2026-10-01', to: '2026-10-09' })
is('two shopping days a week', listWindow('2026-10-03', [3, 6], 4), { from: '2026-10-03', to: '2026-10-06' })
is('days in words', describeDays([6, 3]), 'Wednesday and Saturday')
is('no days in words', describeDays([]), 'the next day')
is('the title', [tripTitle(1), tripTitle(12)], ['Shopping (1 item)', 'Shopping (12 items)'])
is('a trip task is one with the shopping source', isTripTask({ source: 'shopping' }), true)
const trip = { on: true, days: [6], time: '10:00', minutes: 45, locked: true }
const task = (over) => ({ id: 't', planned_date: '2026-10-03', planned_time: '10:00', duration_min: 45, locked: true, title: 'Shopping (3 items)', status: 'todo', deleted_at: null, ...over })
is('none yet: one is made on the next shopping day', planTrip({ today: '2026-10-01', count: 3, on: true, trip, tasks: [] }).create,
  { day: '2026-10-03', title: 'Shopping (3 items)', time: '10:00', minutes: 45, locked: true })
is('there already: only the count changes', planTrip({ today: '2026-10-01', count: 5, on: true, trip, tasks: [task()] }),
  { create: null, update: [{ id: 't', changes: { title: 'Shopping (5 items)' } }], remove: [] })
is('moved by hand: left where it was put', planTrip({ today: '2026-10-01', count: 3, on: true, trip, tasks: [task({ planned_date: '2026-10-02' })] }),
  { create: null, update: [], remove: [] })
is('settings changed: it moves to the new day and time', planTrip({ today: '2026-10-01', count: 3, on: true, replace: true, trip: { ...trip, days: [5], time: '18:00' }, tasks: [task()] }).update,
  [{ id: 't', changes: { planned_date: '2026-10-02', planned_time: '18:00' } }])
is('the list empty: the trip goes', planTrip({ today: '2026-10-01', count: 0, on: true, trip, tasks: [task()] }).remove, ['t'])
is('the setting off: the trip goes', planTrip({ today: '2026-10-01', count: 3, on: true, trip: { ...trip, on: false }, tasks: [task()] }).remove, ['t'])
is('the module off: the trip goes', planTrip({ today: '2026-10-01', count: 3, on: false, trip, tasks: [task()] }).remove, ['t'])
is('a trip left open on a day gone by goes, and a new one is made', (() => {
  const p = planTrip({ today: '2026-10-05', count: 3, on: true, trip, tasks: [task()] })
  return [p.remove, p.create?.day]
})(), [['t'], '2026-10-10'])
is('a trip ticked today: the next one is on the next shopping day', planTrip({ today: '2026-10-03', count: 2, on: true, trip, tasks: [task({ status: 'done' })] }).create?.day, '2026-10-10')
is('a ticked trip is never removed', planTrip({ today: '2026-10-05', count: 0, on: true, trip, tasks: [task({ status: 'done' })] }).remove, [])
is('two open ones (two phones): one stays', planTrip({ today: '2026-10-01', count: 3, on: true, trip, tasks: [task(), task({ id: 'u', planned_date: '2026-10-10' })] }).remove, ['u'])
is('the window in words', [windowText('2026-10-03', '2026-10-06'), windowText('2026-09-30', '2026-10-03'), windowText('2026-10-03', '2026-10-03')],
  ['3 to 6 Oct', '30 Sep to 3 Oct', '3 Oct'])

is('the module\'s settings, nothing stored', readShoppingModule(undefined), { aisles: { aisles: DEFAULT_AISLES, renamed: {} }, lists: [] })
is('lists tidied, each once, at most 12', readShoppingModule({ lists: [' Me ', 'me', '', 7, ...Array.from({ length: 20 }, (_, i) => `L${i}`)] }).lists.length, 12)

// ---- chains in Stores -----------------------------------------------------------------------
const nl = suggestShops('NL', [])
is('the Dutch chains first in the Netherlands', nl.slice(0, 3).map((s) => s.name), ['Albert Heijn', 'Jumbo', 'Lidl'])
is('every Dutch chain asked for is there', CHAINS.NL.map((c) => c.name),
  ['Albert Heijn', 'Jumbo', 'Lidl', 'Aldi', 'Plus', 'Dirk', 'Dekamarkt', 'Hoogvliet', 'Coop', 'Spar', 'Vomar', 'Poiesz', 'Picnic'])
is('Picnic delivers', nl.find((s) => s.name === 'Picnic').online, true)
is('each name once', new Set(nl.map((s) => s.name)).size, nl.length)
is('the neighbours\' chains after', nl.findIndex((s) => s.name === 'Colruyt') > nl.findIndex((s) => s.name === 'Picnic'), true)
is('German chains first in Germany', suggestShops('DE', [])[0].name, 'Edeka')
is('shops already kept are not offered', suggestShops('NL', ['albert heijn']).some((s) => s.name === 'Albert Heijn'), false)
is('the search narrows them', suggestShops('NL', [], 'hoog').map((s) => s.name), ['Hoogvliet'])
is('a chain typed in lower case is written its way', cleanShopName('  albert   heijn '), 'Albert Heijn')
is('a typed shop is kept as typed', cleanShopName('Market stall'), 'Market stall')

if (fail) { console.log(`\n${fail} failed`); process.exit(1) }
console.log('\nall shopping checks passed')
