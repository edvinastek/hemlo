// Checks the Excel import's parsing and food matching, against the real
// catalogue and the awkward names noted in seed/match2.py.
import { readFileSync } from 'node:fs'
import {
  parseIngredientLine, parseIngredients, stateOf, tokens, jaccard, FoodMatcher, ALIAS, planImport,
  fit, pendingEntry, MAX_MACRO,
} from '../lib/match-food.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

// ---- parsing ---------------------------------------------------------------
const rice = parseIngredientLine('Brown rice (cooked) – 60g')
is('rice food', rice.food, 'Brown rice (cooked)')
is('rice grams', rice.grams, 60)
is('rice state', rice.state, 'cooked')

const egg = parseIngredientLine('Hard-boiled egg – 1 large (50g)')
is('egg food', egg.food, 'Hard-boiled egg')
is('egg grams are the last number followed by g', egg.grams, 50)
is('egg qty kept as written', egg.qty, '1 large (50g)')
is('hard-boiled is cooked', egg.state, 'cooked')

is('ml is not grams', parseIngredientLine('Almond milk (unsweetened) – 150ml').grams, null)
is('plain hyphen and a space before g', parseIngredientLine('Olive oil - 5 g').grams, 5)
is('decimal comma', parseIngredientLine('Oats — 40,5g').grams, 40.5)
is('two amounts: the last wins', parseIngredientLine('Chicken – 2 x 30g, about 60g').grams, 60)
is('no dash, amount at the end', parseIngredientLine('Spinach 50g'), { food: 'Spinach', grams: 50, qty: '50g', state: 'raw' })
is('no amount at all', parseIngredientLine('Salt'), { food: 'Salt', grams: null, qty: null, state: 'raw' })
is('bullet stripped', parseIngredientLine('• Banana – 80g').food, 'Banana')
is('blank line is nothing', parseIngredientLine('   '), null)
is('several lines, blanks skipped', parseIngredients('Apple – 150g\r\n\r\nCottage cheese (low-fat) – 100g\n').map((l) => l.grams), [150, 100])
is('whole-wheat is not a dash separator', parseIngredientLine('Whole-wheat pita – 50g').food, 'Whole-wheat pita')

// Review fixes: a number in the food's own name is not its portion.
is('grams in the name do not count when the amount says otherwise', parseIngredientLine('Protein bar (20g protein) – 1 bar').grams, null)
is('ml line with grams in the name stays unknown', parseIngredientLine('Almond milk (1g sugar) – 150ml').grams, null)
is('grams in brackets with no dash still count', parseIngredientLine('Rice (60g)').grams, 60)
is('grams past the server column are unknown', parseIngredientLine('Rice – 12345678g').grams, null)
is('fit keeps a normal value', fit(52.5, MAX_MACRO), 52.5)
is('fit drops a negative', fit(-3, MAX_MACRO), null)
is('fit drops a figure past numeric(7,2)', fit(100000, MAX_MACRO), null)
is('fit keeps unknown unknown', fit(null, MAX_MACRO), null)

for (const w of ['cooked', 'steamed', 'grilled', 'baked', 'boiled', 'roasted', 'drained']) {
  is(`state for "${w}"`, stateOf(`Something (${w})`), 'cooked')
}
is('tuna canned and drained is cooked', stateOf('Tuna (canned in water, drained)'), 'cooked')
is('canned alone stays canned', stateOf('Chickpeas (canned)'), 'canned')
is('plain is raw', stateOf('Apple'), 'raw')
is('bakery is not baked', stateOf('Bakery roll'), 'raw')

// ---- tokens ----------------------------------------------------------------
is('brackets and stop words drop out', [...tokens('Greek yogurt (plain, low-fat)')].sort(), ['greek', 'yogurt'])
is('plurals meet singulars', [...tokens('Blueberries')], [...tokens('Blueberry')])
is('tomatoes meet tomato', [...tokens('Cherry tomatoes')].sort(), ['cherry', 'tomato'])
is('jaccard', jaccard(new Set(['a', 'b']), new Set(['b', 'c'])), 1 / 3)
is('jaccard of nothing', jaccard(new Set(), new Set(['a'])), 0)

// ---- matching against the real catalogue -----------------------------------
const cat = JSON.parse(readFileSync(new URL('../../seed/catalogue.json', import.meta.url), 'utf8'))
const foods = cat.foods.map((f, i) => ({ id: `f${i}`, name: f.name }))
const m = new FoodMatcher(foods)
const name = (raw) => m.match(raw).food?.name ?? null

is('exact, any case', m.match('olive oil'), { food: foods.find((f) => f.name === 'Olive Oil'), how: 'exact', score: 1 })
is('bracket is state, not name', name('Lentils (cooked)'), 'Lentils')
is('oats cooked', name('Oats (cooked)'), 'Oats')

// Every alias the seed notes list must land on a food the catalogue has.
for (const [raw, target] of Object.entries(ALIAS)) {
  is(`alias "${raw}"`, name(raw), target)
}

// Inverted USDA names and near misses, found by word overlap.
is('cottage cheese low-fat', name('Cottage cheese (low-fat)'), 'Cottage Cheese')
is('almond milk', name('Almond milk (unsweetened)'), 'Milk Almond')
is('chia seeds', name('Chia seeds'), 'Chia Seed')
is('protein powder', name('Protein powder'), 'Whey protein powder')
is('walnuts', name('Walnuts'), 'Walnut')
is('almonds', name('Almonds'), 'Almond')
is('shrimp grilled or steamed', name('Shrimp (grilled or steamed)'), 'Shrimp')
is('sweet potato baked', name('Sweet potato (baked)'), 'Sweet Potato')
is('red bell pepper, alias beats overlap', m.match('Red bell pepper').how, 'alias')
is('nonsense matches nothing', m.match('Dragon scales'), { food: null, how: 'none', score: 0 })
is('only stop words matches nothing', m.match('Fresh sliced').food, null)
is('below 0.45 is not a match', m.match('Almond croissant with jam').food, null)

// Every ingredient line of the workbook's 26 recipes finds a food.
let lines = 0, unmatched = []
for (const r of cat.recipes) for (const l of r.lines) {
  lines++
  if (!m.match(l.food).food) unmatched.push(l.food)
}
is(`all ${lines} catalogue recipe lines matched`, unmatched, [])

// ---- the plan ----------------------------------------------------------------
let n = 0
const id = () => `new${++n}`
const preview = {
  sheets: ['D_Food', 'D_Meals', 'D_Exercises'], skipped: 0,
  exercises: [{ name: 'Squat' }, { name: 'Row' }],
  foods: [
    { name: 'APPLE', kcal: 52, carbs_g: 14, fiber_g: 2.4, fat_g: 0.2, protein_g: 0.3 },
    { name: 'Skyr', kcal: 63, carbs_g: 4, fiber_g: 0, fat_g: 0.2, protein_g: 11 },
  ],
  recipes: [
    { name: 'Skyr bowl', kcal: 200, carbs_g: 20, fiber_g: 3, fat_g: 2, protein_g: 20,
      ingredients: 'Skyr – 150g\nBlueberries – 50g\nMystery crunch – 1 handful' },
    { name: 'apple and cottage cheese', kcal: 150, carbs_g: 20, fiber_g: 4, fat_g: 3, protein_g: 12, ingredients: 'Apple – 150g' },
  ],
}
const plan = planImport(preview, {
  foods: [{ id: 'apple', name: 'Apple' }, { id: 'blue', name: 'Blueberry' }],
  recipes: [{ name: 'Apple and cottage cheese' }],
}, 'user-1', id, '2026-09-24T10:00:00.000Z')

is('food already there is skipped, case-insensitive', plan.foodsExisting, 1)
is('new food added as the user\'s own', plan.foods.map((f) => [f.name, f.owner_id, f.state]), [['Skyr', 'user-1', 'raw']])
is('recipe already there is skipped', plan.recipesExisting, 1)
is('one recipe added', plan.recipes.map((r) => [r.recipe.name, r.recipe.owner_id, r.recipe.kcal]), [['Skyr bowl', 'user-1', 200]])
const planned = plan.recipes[0].lines
is('line matched to a food the same workbook adds', planned[0].food_id, plan.foods[0].id)
is('line matched to an existing food', planned[1].food_id, 'blue')
is('lines point at their recipe', planned.every((l) => l.recipe_id === plan.recipes[0].recipe.id), true)
is('unmatched line kept with its text', [planned[2].food_id, planned[2].raw_text, planned[2].note, planned[2].grams_per_portion],
  [null, 'Mystery crunch', '1 handful', null])
is('sort order follows the recipe', planned.map((l) => l.sort_order), [0, 1, 2])
is('matched and not matched counted', [plan.linesMatched, plan.linesUnmatched, plan.unmatched], [2, 1, ['Mystery crunch – 1 handful']])
is('exercises counted', plan.exercises, 2)
is('ids unique', new Set([...plan.foods.map((f) => f.id), ...plan.recipes.flatMap((r) => [r.recipe.id, ...r.lines.map((l) => l.id)])]).size, 5)

// Out-of-range numbers never reach a row: the server would refuse them with an
// error the sync layer retries forever.
const odd = planImport({
  sheets: [], skipped: 0, exercises: [],
  foods: [{ name: 'Typo', kcal: 5200000, carbs_g: -1, fiber_g: null, fat_g: 3, protein_g: 4 }],
  recipes: [{ name: 'Typo meal', kcal: 1e9, carbs_g: 10, fiber_g: 1, fat_g: 2, protein_g: 3, ingredients: '' }],
}, { foods: [], recipes: [] }, 'user-1', id, '2026-09-24T10:00:00.000Z')
is('food macros out of range become unknown', [odd.foods[0].kcal, odd.foods[0].carbs_g, odd.foods[0].fat_g], [null, null, 3])
is('recipe macros out of range become unknown', [odd.recipes[0].recipe.kcal, odd.recipes[0].recipe.carbs_g], [null, 10])

// The queue entry carries exactly the listed fields, like queueChange.
const entry = pendingEntry('food', { id: 'x', name: 'Skyr', kcal: 63, secret: 'no' }, ['name', 'kcal'], 'T')
is('pending entry shape', entry, { table: 'food', row_id: 'x', op: 'upsert', payload: { name: 'Skyr', kcal: 63 }, fields: ['name', 'kcal'], changed_at: 'T' })

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
