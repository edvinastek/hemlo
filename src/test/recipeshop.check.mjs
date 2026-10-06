// Checks recipes onto the shopping list (REC-08, v22): servings and the
// stepper, when to ask, the needs worked out the meal plan's way (scaled,
// cooked weights bought raw, counts kept in one unit, free text left out),
// what is at home left out only when asked, the amounts in what a shop sells
// (packs, whole ones, g or kg, ml or l), how they fit on the list (the same
// unit or g/kg adds; another unit is a line of its own, never a wrong sum;
// ticked, removed, planned and other lists' rows are never added to), the
// aisle and shop from the last time it was bought, and the note.
import {
  defaultServings, stepServings, servingsText, shouldAsk, recipeNeeds, atHome, recipeBuy, listAmount, lastPlaces,
  fitOnList, recipesByFood, forNote, planRecipeAdd, addedText, SERVINGS_MAX,
} from '../lib/recipe-shop-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const egg = { id: 'egg', name: 'Egg average, raw', units: [{ name: 'egg', plural: 'eggs', g: 50 }] }
const rice = { id: 'rice', name: 'Rice, white', cook_yield: 2.5, units: [] }
const onion = { id: 'onion', name: 'Onions, raw', units: [{ name: 'onion', plural: 'onions', g: 95 }] }
const pasta = { id: 'pasta', name: 'Pasta', pack_size_g: 500, units: [] }
const milk = { id: 'milk', name: 'Milk', per_ml: true, units: [] }
const foods = new Map([egg, rice, onion, pasta, milk].map((f) => [f.id, f]))
const L = (id, recipe_id, food_id, g, extra = {}) => ({ id, recipe_id, food_id, raw_text: null, grams_per_portion: g, state: null, sort_order: 0, ...extra })
const curry = [
  L('c1', 'curry', 'rice', 150, { state: 'cooked' }),
  L('c2', 'curry', 'onion', 47.5, { unit: 'onion', unit_qty: 0.5 }),
  L('c3', 'curry', null, null, { raw_text: 'Salt to taste' }),
]
const omelette = [
  L('o1', 'omelette', 'egg', 100, { unit: 'egg', unit_qty: 2, raw_text: 'Eggs' }),
  L('o2', 'omelette', 'onion', 95, { unit: 'onion', unit_qty: 1 }),
  L('o3', 'omelette', 'milk', 50),
]
const bake = [L('b1', 'bake', 'pasta', 120), L('b2', 'bake', 'milk', 300)]
const byRecipe = new Map([['curry', curry], ['omelette', omelette], ['bake', bake]])
const names = new Map([['curry', 'Curry'], ['omelette', 'Omelette'], ['bake', 'Pasta bake']])

// ---- servings -------------------------------------------------------------------------
is('a recipe’s own servings by default', [defaultServings({ portions_per_batch: 4 }), defaultServings({ portions_per_batch: 0 }), defaultServings({ portions_per_batch: null })], [4, 1, 1])
is('never more than the most', defaultServings({ portions_per_batch: 400 }), SERVINGS_MAX)
is('the stepper: halves below one, wholes above', [stepServings(1, -1), stepServings(0.5, -1), stepServings(0.5, 1), stepServings(1, 1), stepServings(2.5, 1), stepServings(2.5, -1)], [0.5, 0.5, 1, 2, 3, 2])
is('servings in words', [servingsText(1), servingsText(0.5), servingsText(4), servingsText(1.5)], ['1 serving', '½ serving', '4 servings', '1½ servings'])
is('asks only when needed', [shouldAsk(true, 0), shouldAsk(true, 2), shouldAsk(false, 0)], [false, true, true])

// ---- what the recipes need, the meal plan's way --------------------------------------------
const needs = recipeNeeds([{ recipe_id: 'curry', servings: 2 }, { recipe_id: 'omelette', servings: 1 }], byRecipe, foods)
const need = (id) => needs.find((n) => n.food_id === id)
is('cooked rice is bought raw, for two servings', need('rice').grams, 120)
is('onions of both recipes in one unit add up as a count', [need('onion').grams, need('onion').count?.qty, need('onion').count?.unit.name], [190, 2, 'onion'])
is('what the recipe calls it is the name', need('egg').said, 'Eggs')
is('free text is left out', needs.some((n) => n.food_id === null), false)
is('a recipe with no servings adds nothing', recipeNeeds([{ recipe_id: 'curry', servings: 0 }], byRecipe, foods), [])
is('scaled: three servings are three times one', recipeNeeds([{ recipe_id: 'bake', servings: 3 }], byRecipe, foods).map((n) => n.grams), [360, 900])

// ---- at home, and what to buy ---------------------------------------------------------------
const stock = new Map([['rice', 1000], ['egg', 50]])
is('what is at home of it', atHome(needs, stock, foods), ['Rice, white', 'Eggs'])
const kept = recipeBuy(needs, foods, stock)
is('rice fully at home drops out when asked', kept.some((l) => l.food_id === 'rice'), false)
is('one egg at home: one egg to buy', kept.find((l) => l.food_id === 'egg')?.count, 1)
const all = recipeBuy(needs, foods, null)
is('with home not left out, all of it', all.map((l) => l.food_id).sort(), ['egg', 'milk', 'onion', 'rice'])
is('a minimum kept in Stock is not this action’s', recipeBuy(recipeNeeds([{ recipe_id: 'bake', servings: 1 }], byRecipe, foods), foods, new Map([['egg', 10]])).map((l) => l.food_id).sort(), ['milk', 'pasta'])

// ---- amounts as the list keeps them --------------------------------------------------------
const bakeLines = recipeBuy(recipeNeeds([{ recipe_id: 'bake', servings: 5 }], byRecipe, foods), foods, null)
is('whole packs where the pack size is known', listAmount(bakeLines.find((l) => l.food_id === 'pasta'), pasta), { qty: 2, unit: 'pack', grams: 1000 })
is('a drink in litres', listAmount(bakeLines.find((l) => l.food_id === 'milk'), milk), { qty: 1.5, unit: 'l', grams: 1500 })
is('a counted food in whole ones of its unit', listAmount(all.find((l) => l.food_id === 'onion'), onion), { qty: 2, unit: 'onion', grams: 190 })
is('else grams', listAmount(all.find((l) => l.food_id === 'rice'), rice), { qty: 120, unit: 'g', grams: 120 })
is('a little drink in millilitres', listAmount(all.find((l) => l.food_id === 'milk'), milk), { qty: 50, unit: 'ml', grams: 50 })

// ---- where it goes ---------------------------------------------------------------------------
is('the aisle and shop of the last time it was bought', [...lastPlaces([
  { food_id: 'egg', aisle: 'Dairy', shop: 'Lidl', bought_at: '2026-09-01T10:00:00Z' },
  { food_id: 'egg', aisle: 'Eggs', shop: 'Jumbo', bought_at: '2026-09-20T10:00:00Z' },
  { food_id: 'egg', aisle: 'Old', shop: null, bought_at: null },
  { food_id: 'milk', aisle: null, shop: null, bought_at: '2026-09-21T10:00:00Z' },
])], [['egg', { aisle: 'Eggs', shop: 'Jumbo' }]])
is('which recipes a food is for', [...recipesByFood([{ recipe_id: 'curry', servings: 1 }, { recipe_id: 'omelette', servings: 1 }], byRecipe, names).get('onion')], ['Curry', 'Omelette'])
is('the note', [forNote(['Curry']), forNote(['Curry', 'Omelette']), forNote([]), forNote(['x'.repeat(300)]).length], ['For Curry', 'For Curry, Omelette', null, 200])

// ---- onto the list as it is -----------------------------------------------------------------
const E = (id, food_id, qty, unit, grams, extra = {}) => ({ id, household_id: 'h', plan_key: null, food_id, name: food_id, qty, unit, grams, note: null, aisle: null, shop: null, checked: false, checked_at: null, sort_order: 0, added_by: 'p', list: null, bought_at: null, done_until: null, deleted_at: null, ...extra })
const add = (food_id, qty, unit, grams) => ({ food_id, name: food_id, qty, unit, grams, aisle: null, shop: null, note: null })
const list = [
  E('e1', 'rice', 500, 'g', 500),
  E('e2', 'onion', 1, 'pack', null),
  E('e3', 'egg', 6, 'egg', 300, { checked: true }),
  E('e4', 'milk', 1, 'l', 1000, { list: 'Party' }),
  E('e5', 'pasta', 1, 'pack', 500, { deleted_at: '2026-10-01T00:00:00Z' }),
  E('e6', 'egg', 2, 'egg', 100, { plan_key: 'egg' }),
]
const ops = fitOnList([add('rice', 1, 'kg', 1000), add('onion', 2, 'onion', 190), add('egg', 2, 'egg', 100), add('milk', 500, 'ml', 500), add('pasta', 1, 'pack', 500)], list, null)
is('grams and kilos add up, in kilos', ops[0], { kind: 'more', entry_id: 'e1', amount: { qty: 1.5, unit: 'kg', grams: 1500 } })
is('the same food in another unit is a line of its own', ops[1].kind === 'new' && ops[1].item.unit, 'onion')
is('a ticked row (in the basket) is not added to', ops[2].kind, 'new')
is('another list’s row is not added to', ops[3].kind, 'new')
is('a removed row is not added to', ops[4].kind, 'new')
is('the meal plan’s own row is never added to', ops.some((o) => o.kind === 'more' && o.entry_id === 'e6'), false)
const twice = fitOnList([add('rice', 100, 'g', 100), add('rice', 1, 'pack', null), add('rice', 2, 'pack', null)], [E('r', 'rice', 200, 'g', 200)], null)
is('two adds to one row are one change, with the sum', twice.map((o) => o.kind === 'more' ? `${o.entry_id}:${o.amount.qty}${o.amount.unit}` : `new:${o.item.qty}${o.item.unit}`), ['r:300g', 'new:1pack', 'new:2pack'])
is('the same unit adds on a named list', fitOnList([add('milk', 1, 'l', 1000)], list, 'Party')[0], { kind: 'more', entry_id: 'e4', amount: { qty: 2, unit: 'l', grams: 2000 } })
is('a row with no amount takes the amount', fitOnList([add('rice', 2, 'pack', null)], [E('r', 'rice', null, null, null)], null)[0], { kind: 'more', entry_id: 'r', amount: { qty: 2, unit: 'pack', grams: null } })

// ---- the whole of it --------------------------------------------------------------------------
const whole = planRecipeAdd({
  picks: [{ recipe_id: 'curry', servings: 2 }, { recipe_id: 'omelette', servings: 1 }], linesByRecipe: byRecipe, foods, recipeNames: names,
  stock, skipHome: true, entries: [E('e1', 'egg', 1, 'egg', 50), E('old', 'onion', 1, 'onion', 95, { deleted_at: '2026-09-01T00:00:00Z', bought_at: '2026-09-01T00:00:00Z', aisle: 'Veg', shop: 'Lidl' })], list: null,
})
is('one egg goes on the egg already there', whole.ops.find((o) => o.kind === 'more'), { kind: 'more', entry_id: 'e1', amount: { qty: 2, unit: 'egg', grams: 100 } })
const onionOp = whole.ops.find((o) => o.kind === 'new' && o.item.food_id === 'onion')
is('a new line has its place and its note', onionOp && [onionOp.item.aisle, onionOp.item.shop, onionOp.item.note, onionOp.item.qty], ['Veg', 'Lidl', 'For Curry, Omelette', 2])
is('rice covered by what is at home', [whole.covered, whole.atHome], [1, ['Rice, white', 'Eggs']])
const noSkip = planRecipeAdd({ picks: [{ recipe_id: 'curry', servings: 2 }], linesByRecipe: byRecipe, foods, recipeNames: names, stock, skipHome: false, entries: [], list: null })
is('not leaving out what is at home buys it all', [noSkip.ops.length, noSkip.covered], [2, 0])
is('what is said after', [addedText(12), addedText(1), addedText(0)], ['12 items added to Shopping', '1 item added to Shopping', 'Nothing to add: it is all at home'])

console.log(fail ? `\n${fail} failed` : '\nAll recipe-to-list checks passed')
process.exit(fail ? 1 : 0)
