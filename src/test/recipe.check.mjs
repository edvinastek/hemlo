// Checks the recipe rules: what a recipe is for (ready meals included), the
// search text and the sorts of the Recipes tab, a recipe scaled to a number
// of portions and its figures for any label line (unknown never counted as
// 0), a variation's name, what to buy after the cupboard, and a ready meal.
import {
  ROLES, roleLabel, rolesFor, isReady, recipeSearchText, usage, recipeOrder, scaleLines, recipeFigures, variationName,
  toBuy, readyProduct,
} from '../lib/recipe-rules.ts'
import { search } from '../lib/search-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`)
}

const egg = { id: 'egg', name: 'Egg average, raw', name_nl: 'Ei kippen- rauw gem', kcal: 132, protein_g: 12.6, fat_g: 9, carbs_g: 0.4, fiber_g: 0, sodium_mg: 140,
  units: [{ name: 'egg', plural: 'eggs', g: 50, size: 'M' }, { name: 'small egg', plural: 'small eggs', g: 40, size: 'S' }] }
const oats = { id: 'oats', name: 'Oat flakes', name_nl: 'Vlokken haver-', kcal: 366, protein_g: 13, fat_g: 7, carbs_g: 59, fiber_g: 10, sugars_g: 1, cook_yield: 2.5, units: [] }
const onion = { id: 'onion', name: 'Onions, raw', kcal: 37, protein_g: 1.2, fat_g: 0, carbs_g: 6.7, fiber_g: 2, store_section: 'Vegetables',
  units: [{ name: 'onion', plural: 'onions', g: 95, bought_g: 100, size: 'M' }] }
const foods = new Map([egg, oats, onion].map((f) => [f.id, f]))
const lines = [
  { id: 'l2', recipe_id: 'r1', food_id: 'oats', raw_text: null, grams_per_portion: 40, state: null, sort_order: 1 },
  { id: 'l1', recipe_id: 'r1', food_id: 'egg', raw_text: 'Eggs', grams_per_portion: 100, unit: 'egg', unit_qty: 2, state: null, sort_order: 0 },
  { id: 'l3', recipe_id: 'r1', food_id: null, raw_text: 'Salt to taste', grams_per_portion: null, state: null, note: null, sort_order: 2 },
  { id: 'l4', recipe_id: 'r1', food_id: 'onion', raw_text: null, grams_per_portion: 47.5, unit: 'onion', unit_qty: 0.5, state: null, note: 'finely chopped', sort_order: 3 },
]

// What a recipe is for.
is('a ready meal is offered', ROLES.some((r) => r.value === 'ready' && r.label === 'Ready meal'), true)
is('labels', [roleLabel('ready'), roleLabel(null), roleLabel('main'), roleLabel('kwark')], ['Ready meal', 'Any meal', 'Main meal', 'Quark bowl'])
is('an old role stays on offer for its own recipe only', [rolesFor('kwark').length, rolesFor('lunch').length], [ROLES.length + 1, ROLES.length])
is('is a ready meal', [isReady({ role: 'ready' }), isReady({ role: 'lunch' })], [true, false])

// Search: names, ingredients (Dutch too) and what it is for.
const text = recipeSearchText({ id: 'r1', role: 'breakfast' }, lines, foods)
is('the search text holds ingredients and the role', ['Breakfast', 'Eggs', 'Oat flakes', 'Vlokken haver-', 'Salt to taste'].every((w) => text.includes(w)), true)
const recipes = [
  { id: 'r1', name: 'Morning bowl', extra: text },
  { id: 'r2', name: 'Oat cookies', extra: 'Oat flakes Butter' },
  { id: 'r3', name: 'Curry', extra: 'Onions, raw Chicken' },
]
is('found by an ingredient', search(recipes, 'haver').map((r) => r.id), ['r1'])
is('found by its name first', search(recipes, 'oat').map((r) => r.id), ['r2', 'r1'])

// Sorting (REC-01).
const use = usage(
  [{ recipe_id: 'r1', log_date: '2026-09-01' }, { recipe_id: 'r1', log_date: '2026-09-20' }, { recipe_id: 'r2', log_date: '2026-09-25' },
    { recipe_id: 'r2', log_date: '2026-09-26', deleted_at: 'x' }],
  [{ recipe_id: 'r3', slot_date: '2026-10-01' }])
is('usage: last day and how often eaten', [use.get('r1'), use.get('r2'), use.get('r3')], [{ last: '2026-09-20', count: 2 }, { last: '2026-09-25', count: 1 }, { last: '2026-10-01', count: 0 }])
const rows = [{ id: 'r1', name: 'Morning bowl', kcal: 450 }, { id: 'r2', name: 'Oat cookies', kcal: null }, { id: 'r3', name: 'Curry', kcal: 600 }]
const sorted = (s) => [...rows].sort(recipeOrder(s, use)).map((r) => r.id)
is('by calories, unknown last', sorted('kcal'), ['r1', 'r3', 'r2'])
is('recently used first', sorted('recent'), ['r3', 'r2', 'r1'])
is('most cooked first', sorted('cooked'), ['r1', 'r2', 'r3'])
is('best match: the search’s own order', recipeOrder('name', use), undefined)

// Scaled (REC-02, REC-06).
const two = scaleLines('r1', lines, foods, 2)
is('in the recipe’s order', two.map((l) => l.id), ['l1', 'l2', 'l3', 'l4'])
is('grams for two portions', two.map((l) => l.grams), [200, 80, null, 95])
is('counts for two portions', [two[0].count?.qty, two[3].count?.qty], [4, 1])
is('a free-text line keeps its words', two[2].name, 'Salt to taste')
is('a line’s note', two[3].note, 'finely chopped')

const fig = recipeFigures(lines.filter((l) => l.recipe_id === 'r1'), foods, ['kcal', 'sugars_g', 'salt_g'])
is('kcal a portion from every food', Math.round(fig.kcal.value), Math.round(132 + 366 * 0.4 + 37 * 0.475))
is('a figure some foods do not give says how many', [Math.round(fig.sugars_g.value * 10) / 10, fig.sugars_g.missing], [0.4, 2])
is('salt from published sodium', [Math.round(fig.salt_g.value * 1000) / 1000, fig.salt_g.missing], [0.35, 2])
is('figures for a batch', Math.round(recipeFigures(lines, foods, ['kcal'], 4).kcal.value), Math.round(fig.kcal.value * 4))
const cookedOats = [{ ...lines[0], state: 'cooked', grams_per_portion: 100 }]
is('a cooked weight is turned back into raw before the figures', Math.round(recipeFigures(cookedOats, foods, ['kcal']).kcal.value), Math.round(366 * 0.4))

// Duplicate (REC-05).
is('a variation', variationName('Chicken curry', ['Chicken curry']), 'Chicken curry (variation)')
is('a second variation', variationName('Chicken curry', ['Chicken curry', 'Chicken curry (variation)']), 'Chicken curry (variation 2)')
is('a variation of a variation', variationName('Chicken curry (variation)', ['Chicken curry (variation)']), 'Chicken curry (variation 2)')
is('never past 120 characters', variationName('x'.repeat(120), []).length <= 120, true)

// To buy, minus stock (REC-20).
const { buy, inStock } = toBuy(two, new Map([['oats', 500], ['egg', 100]]))
is('stock covers the oats', inStock, ['Oat flakes'])
is('eggs still to buy: two, in whole eggs', buy.find((b) => b.food_id === 'egg'), { food_id: 'egg', name: 'Egg average, raw', grams: 100, count: { qty: 2, unit: 'egg' }, from_stock: 100, aisle: null })
is('an onion is bought whole, weighed as bought', buy.find((b) => b.food_id === 'onion'), { food_id: 'onion', name: 'Onions, raw', grams: 100, count: { qty: 1, unit: 'onion' }, from_stock: 0, aisle: 'Vegetables' })
is('free text is not bought by itself', buy.some((b) => b.name === 'Salt to taste'), false)
is('cooked oats are bought raw', Math.round(toBuy(scaleLines('r1', cookedOats, foods, 1), new Map()).buy[0].grams), 40)

// A ready meal (REC-21).
const ready = { id: 'rm', role: 'ready' }
const rLines = [{ id: 'x', recipe_id: 'rm', food_id: 'oats', raw_text: null, grams_per_portion: 400, state: null, sort_order: 0 }]
is('a ready meal is its one product, the pack as a portion', readyProduct(ready, rLines, foods)?.grams, 400)
is('… and its food', readyProduct(ready, rLines, foods)?.food?.id, 'oats')
is('not a ready meal: none', readyProduct({ id: 'r1', role: 'lunch' }, lines, foods), null)

console.log(fail ? `\n${fail} failed` : '\nAll recipe checks passed')
process.exit(fail ? 1 : 0)
