// Checks the stock rules: reading and showing amounts, the −/+ steps, what a
// meal takes and gives back, and what a finished trip puts in the cupboard.
import {
  toGrams, formatGrams, inUnit, takesStock, unitFor, stepFor, nudge, applyDelta, mealNeeds, takeOut, putBack,
  boughtGrams, sortStock, filterStock, cleanNote, stockStep, MAX_GRAMS,
  cleanPlace, placesFrom, daysUntil, dateText, expiringSoon, readDate, belowMin, cleanMin, groupKey, sortByPlace, stockCover,
} from '../lib/stock-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// Typing an amount.
is('grams as typed', toGrams('450', 'g'), 450)
is('kilos become grams', toGrams('1.5', 'kg'), 1500)
is('a comma is a decimal point', toGrams('1,25', 'kg'), 1250)
is('spaces are ignored', toGrams(' 2 000 ', 'g'), 2000)
is('nothing typed is no amount', toGrams('', 'g'), null)
is('words are no amount', toGrams('lots', 'g'), null)
is('below zero is no amount', toGrams('-5', 'g'), null)
is('zero is an amount (out)', toGrams('0', 'kg'), 0)
is('past the database’s cap is refused', toGrams('1001', 'kg'), null)
is('the cap itself is fine', toGrams(MAX_GRAMS, 'g'), MAX_GRAMS)
is('tenths of a gram are kept, no more', toGrams('0.333', 'kg'), 333)

// Showing one.
is('under a kilo in grams', formatGrams(450), '450 g')
is('grams are whole', formatGrams(449.6), '450 g')
is('a kilo and up in kg', formatGrams(1000), '1 kg')
is('kilos keep two places', formatGrams(1250), '1.25 kg')
is('and drop trailing zeros', formatGrams(1500), '1.5 kg')
is('nothing is 0 g', formatGrams(0), '0 g')
is('a crumb still shows as something', formatGrams(0.4), '1 g')
is('the unit an amount reads best in', [unitFor(999), unitFor(1000)], ['g', 'kg'])
is('back into a field in kilos', inUnit(1250, 'kg'), '1.25')
is('back into a field in grams', inUnit(450.4, 'g'), '450')

// −/+ steps.
is('steps grow with the amount', [stepFor(30), stepFor(450), stepFor(2000), stepFor(8000)], [10, 50, 100, 500])
is('+ snaps up to the step', nudge(437, 1), 450)
is('− snaps down to the step', nudge(437, -1), 400)
is('+ from a round amount adds a step', nudge(400, 1), 450)
is('− from a round amount takes a step', nudge(400, -1), 350)
is('+ then − returns across a boundary', nudge(nudge(950, 1), -1), 950)
is('− then + returns across a boundary', nudge(nudge(1000, -1), 1), 1000)
is('− never goes below nothing', nudge(5, -1), 0)
is('− from nothing stays at nothing', nudge(0, -1), 0)
is('+ from nothing starts at a step', nudge(0, 1), 10)
is('+ never passes the cap', nudge(MAX_GRAMS, 1), MAX_GRAMS)

// Changing an amount.
is('taking more than there is empties it', applyDelta(50, -200), { next: 0, moved: -50 })
is('adding adds', applyDelta(50, 200), { next: 250, moved: 200 })
is('float noise is tidied', applyDelta(0.1, 0.2).next, 0.3)

// A meal's needs: raw grams times portions, cooked weights converted back.
const foods = new Map([
  ['rice', { id: 'rice', cook_yield: 2.5 }],
  ['oil', { id: 'oil', cook_yield: null }],
])
const lines = [
  { recipe_id: 'r', food_id: 'rice', grams_per_portion: 200, state: 'cooked' },
  { recipe_id: 'r', food_id: 'oil', grams_per_portion: 10, state: null },
  { recipe_id: 'r', food_id: 'oil', grams_per_portion: 5, state: null },
  { recipe_id: 'r', food_id: null, raw_text: 'salt', grams_per_portion: 2 },
]
is('raw weight per food, times the portions', Object.fromEntries(mealNeeds(lines, foods, 1.5)), { rice: 120, oil: 22.5 })
is('a nonsense portion count counts as one', Object.fromEntries(mealNeeds(lines, foods, 0)), { rice: 80, oil: 15 })

// Eating it, then unticking it.
const needs = new Map([['rice', 120], ['oil', 22.5], ['chicken', 300]])
const have = new Map([['rice', 1000], ['oil', 10], ['beans', 400]])
const out = takeOut(needs, have)
is('what is here goes down', Object.fromEntries(out.next), { rice: 880, oil: 0 })
is('only what was there is taken', out.taken, { rice: 120, oil: 10 })
is('a food not in stock gets no row', out.next.has('chicken'), false)
is('an empty row is left alone', takeOut(new Map([['oil', 5]]), new Map([['oil', 0]])).next.size, 0)
const after = new Map([...have, ...out.next])
is('unticking puts back exactly what was taken', Object.fromEntries(putBack(out.taken, after)), { rice: 1000, oil: 10 })
is('a food removed since is not brought back', putBack({ rice: 120 }, new Map()).size, 0)

// Home from the shop.
is('whole packs where the pack is known', boughtGrams({ needed_g: 450, from_stock_g: 200, pack_size_g: 500, packs: 1 }), 500)
is('else what the list said to buy', boughtGrams({ needed_g: 450, from_stock_g: 200, pack_size_g: null, packs: null }), 250)
is('never below nothing', boughtGrams({ needed_g: 100, from_stock_g: 300, pack_size_g: null, packs: null }), 0)

// The list.
const rows = [
  { name: 'Rice', section: 'Pantry', note: null },
  { name: 'Apples', section: 'Produce', note: 'in the bowl' },
  { name: 'Mystery', section: 'Other', note: null },
  { name: 'Beans', section: 'Pantry', note: 'tinned' },
]
is('by aisle, then name, Other last', sortStock(rows).map((r) => r.name), ['Beans', 'Rice', 'Apples', 'Mystery'])
is('the filter reads name, aisle and note', filterStock(rows, 'pantry tin').map((r) => r.name), ['Beans'])
is('every word must match', filterStock(rows, 'rice bowl').length, 0)
is('an empty filter keeps everything', filterStock(rows, '  ').length, 4)
is('a note is trimmed; empty is none', [cleanNote('  opened '), cleanNote('   '), cleanNote(null)], ['opened', null, null])
is('a long note is cut to fit', cleanNote('x'.repeat(300)).length, 200)

// A tap on a row kept in eggs: one egg, when the food is here; a gram step
// when it is not (a housemate's scan still on its way), leaving the unit alone.
const eggUnits = [{ name: 'egg', plural: 'eggs', g: 50 }]
is('+ one egg when the food is here', stockStep(1210, 'egg', eggUnits, 1), 1250)
is('a food not here moves by grams', stockStep(1210, 'egg', null, 1), 1300)
is('− by grams too', stockStep(600, 'egg', null, -1), nudge(600, -1))
is('a unit the food lost moves by grams', stockStep(430, 'slice', eggUnits, 1), nudge(430, 1))
is('no unit, grams', stockStep(430, null, eggUnits, 1), 450)

// Where it is kept and until when (STK-03).
is('a place is tidied with a capital', cleanPlace('  cellar  shelf '), 'Cellar shelf')
is('no place is none', cleanPlace('  '), null)
is('the usual places first, then the person\'s own, each once', placesFrom(['cellar', 'Fridge', 'Balcony', 'Cellar', null]), ['Fridge', 'Freezer', 'Cupboard', 'Balcony', 'Cellar'])
is('days until a date', [daysUntil('2026-10-05', '2026-10-03'), daysUntil('2026-10-01', '2026-10-03')], [2, -2])
is('a date in words', ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-06', '2026-10-14'].map((d) => dateText(d, '2026-10-03')),
  ['2 days past its date', '1 day past its date', 'use today', 'use by tomorrow', '3 days left', 'until 14 Oct'])
const dated = [
  { name: 'Milk', grams: 1000, best_before: '2026-10-04' }, { name: 'Yoghurt', grams: 500, best_before: '2026-10-02' },
  { name: 'Rice', grams: 900, best_before: '2027-05-01' }, { name: 'Ham', grams: 0, best_before: '2026-10-03' }, { name: 'Salt', grams: 500 },
]
is('use soon: dated within three days or past it, soonest first, not what is out', expiringSoon(dated, '2026-10-03').map((r) => r.name), ['Yoghurt', 'Milk'])
is('a quick date: day and month', readDate('1410', '2026-10-03'), '2026-10-14')
is('a day and month gone by is next year', readDate('0210', '2026-10-03'), '2027-10-02')
is('day, month and year', [readDate('14-10-26', '2026-10-03'), readDate('14.10.2026', '2026-10-03'), readDate('2026-10-14', '2026-10-03')],
  ['2026-10-14', '2026-10-14', '2026-10-14'])
is('not a day', [readDate('3102', '2026-10-03'), readDate('soon', '2026-10-03'), readDate('2026-02-30', '2026-10-03')], [null, null, null])

// The minimum kept (STK-04).
is('below the minimum', [belowMin({ grams: 100, min_grams: 250 }), belowMin({ grams: 250, min_grams: 250 }), belowMin({ grams: 0, min_grams: null })], [true, false, false])
is('a minimum as stored', [cleanMin(250.04), cleanMin(0), cleanMin(null), cleanMin(5e6)], [250, null, null, MAX_GRAMS])
is('grouped by place, or by aisle', [groupKey({ place: 'fridge', section: 'Dairy' }, 'place'), groupKey({ place: null, section: 'Dairy' }, 'place'), groupKey({ place: 'Fridge', section: 'Dairy' }, 'aisle')],
  ['Fridge', 'No place set', 'Dairy'])
is('places in the offered order, none last', sortByPlace([
  { name: 'b', place: null, section: '' }, { name: 'a', place: 'Cellar', section: '' }, { name: 'c', place: 'Freezer', section: '' }, { name: 'd', place: 'fridge', section: '' },
], placesFrom(['Cellar'])).map((r) => r.name), ['d', 'c', 'a', 'b'])

// Cooking from what is here (STK-06).
is('how much of a recipe is in stock', stockCover(new Map([['rice', 100], ['egg', 100]]), new Map([['rice', 300], ['egg', 50]])), { share: 0.75, missing: ['egg'] })
is('nothing needed covers nothing', stockCover(new Map(), new Map()).share, 0)

// What eating touches: a recipe or ready meal, or one food with grams;
// numbers typed with no food change nothing.
is('a recipe takes from stock', takesStock({ recipe_id: 'r', food_id: null, grams: null }), true)
is('one food with grams does', takesStock({ recipe_id: null, food_id: 'f', grams: '120' }), true)
is('one food with no amount does not', takesStock({ recipe_id: null, food_id: 'f', grams: 0 }), false)
is('typed numbers do not', takesStock({ recipe_id: null, food_id: null, grams: 300 }), false)

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
