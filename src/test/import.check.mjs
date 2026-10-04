// Checks the Excel import's parsing and food matching, against the real
// catalogue and the awkward names noted in seed/match2.py.
import { readFileSync } from 'node:fs'
import {
  parseIngredientLine, parseIngredients, stateOf, tokens, jaccard, FoodMatcher, ALIAS, planImport,
  fit, pendingEntry, MAX_MACRO,
} from '../lib/match-food.ts'
import { KEEP } from '../../scripts/nevo-additions.mjs'

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
// Fractions and bare numbers (review fix): NFKC turned "½" into "1⁄2", which
// read as a bare "1"; a bare number read as that many of the first unit.
is('Avocado – ½', parseIngredientLine('Avocado – ½'), { food: 'Avocado', grams: null, qty: '1/2', state: 'raw' })
is('½ avocado (75g)', parseIngredientLine('½ avocado (75g)'), { food: 'avocado', grams: 75, qty: '1/2 avocado (75g)', state: 'raw', whole: '1/2 avocado (75g)' })
is('1/2 egg', parseIngredientLine('1/2 egg'), { food: 'egg', grams: null, qty: '1/2 egg', state: 'raw', whole: '1/2 egg' })
is('1½ eggs is one and a half, not eleven halves', parseIngredientLine('Egg – 1½').qty, '1 1/2')
is('Milk – 200 is 200 g', parseIngredientLine('Milk – 200'), { food: 'Milk', grams: 200, qty: '200', state: 'raw' })
is('2 eggs', parseIngredientLine('2 eggs'), { food: 'eggs', grams: null, qty: '2 eggs', state: 'raw', whole: '2 eggs' })
is('100g oats', parseIngredientLine('100g oats'), { food: 'oats', grams: 100, qty: '100 g', state: 'raw', whole: '100g oats' })
is('a word starting with g is not grams', parseIngredientLine('2 green apples').food, 'green apples')
is('a name starting with a number stays whole', parseIngredientLine('7up 330ml').food, '7up 330ml')
is('past 10 kg a portion is a problem, with no grams', parseIngredientLine('Rice – 20000g'),
  { food: 'Rice', grams: null, qty: '20000g', state: 'raw', problem: '20 kg a portion is more than 10 kg' })
is('a bare number past 10 kg too', parseIngredientLine('Milk – 50000').problem, '50 kg a portion is more than 10 kg')
const unitsPlan = planImport({
  sheets: [], skipped: 0, exercises: [], foods: [],
  recipes: [{ name: 'Units test', kcal: 1, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0,
    ingredients: 'Avocado – ½\n½ avocado (75g)\nEgg – 1/2 egg\nMilk – 200\n2 eggs\nEgg – 300 eggs\nRice – 20000g' }],
}, {
  foods: [{ id: 'av', name: 'Avocado', units: [{ name: 'avocado', g: 150 }] }, { id: 'eg', name: 'Egg', units: [{ name: 'egg', plural: 'eggs', g: 50 }] },
    { id: 'mi', name: 'Milk', units: [{ name: 'glass', g: 250 }] }, { id: 'ri', name: 'Rice' }],
  recipes: [],
}, 'user-1', () => `id${Math.random()}`, '2026-09-28T10:00:00.000Z')
const ul = unitsPlan.recipes[0].lines.map((l) => [l.food_id, l.grams_per_portion, l.unit ?? null, l.unit_qty ?? null])
is('Avocado – ½ is half an avocado, 75 g', ul[0], ['av', 75, 'avocado', 0.5])
is('½ avocado (75g) is half an avocado, 75 g', ul[1], ['av', 75, 'avocado', 0.5])
is('1/2 egg is half an egg', ul[2], ['eg', 25, 'egg', 0.5])
is('Milk – 200 is 200 g, not 200 glasses', ul[3], ['mi', 200, null, null])
is('2 eggs are 2 eggs of the food Egg', ul[4], ['eg', 100, 'egg', 2])
is('300 eggs a portion keeps no amount', ul[5], ['eg', null, null, null])
is('20 kg of rice keeps no amount', ul[6], ['ri', null, null, null])
is('both are shown in the preview', unitsPlan.problems.length, 2)
const sevenUp = planImport({
  sheets: [], skipped: 0, exercises: [], foods: [],
  recipes: [{ name: 'Fizz', kcal: 1, carbs_g: 0, fiber_g: 0, fat_g: 0, protein_g: 0, ingredients: '7 Up\n2 eggs' }],
}, {
  foods: [{ id: '7u', name: '7 Up' }, { id: 'eg', name: 'Egg', units: [{ name: 'egg', plural: 'eggs', g: 50 }] }], recipes: [],
}, 'user-1', () => `id${Math.random()}`, '2026-09-29T10:00:00.000Z')
is('"7 Up" is the drink, not seven of "Up"; "2 eggs" still counts eggs',
  sevenUp.recipes[0].lines.map((l) => [l.food_id, l.unit ?? null, l.unit_qty ?? null]), [['7u', null, null], ['eg', 'egg', 2]])

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
// The shared list since migration 027: NEVO-online 2025/9.0, and the old foods
// it keeps. The workbook's recipes still read their own names.
const cat = JSON.parse(readFileSync(new URL('../../seed/catalogue.json', import.meta.url), 'utf8'))
const sql027 = readFileSync(new URL('../../supabase/migrations/027_food_catalogue.sql', import.meta.url), 'utf8')
const nevoRows = JSON.parse(sql027.slice(sql027.indexOf('$nevo$[') + 6, sql027.indexOf(']$nevo$') + 1))
const foods = [...nevoRows.map((r) => ({ id: r.id, name: r.name })), ...Object.values(KEEP).map((n, i) => ({ id: `kept${i}`, name: n }))]
const m = new FoodMatcher(foods)
const name = (raw) => m.match(raw).food?.name ?? null

is('exact, any case', m.match('olive oil'), { food: foods.find((f) => f.name === 'Olive oil'), how: 'exact', score: 1 })
is('bracket is state, not name', name('Avocado (ripe)'), 'Avocado')
is('oats cooked are oat flakes, turned back to raw by their yield', name('Oats (cooked)'), 'Oat flakes')

// Every alias lands on a food the catalogue has.
for (const [raw, target] of Object.entries(ALIAS)) {
  is(`alias "${raw}"`, name(raw), target)
}

// Words found in a food's name, the plainest food first; never a food made
// from it (a drink, a flour, a dried one) when the food itself is there.
is('protein powder', name('Protein powder'), 'Whey protein powder')
is('walnuts are walnuts, not walnut oil', name('Walnuts'), 'Walnuts unsalted')
is('blueberries', name('Blueberries'), 'Blueberries')
is('plain yoghurt', name('Yoghurt'), 'Yoghurt low fat')
is('a Dutch shopper’s quark', name('Quark'), 'Quark low fat')
is('skyr', name('Skyr'), 'Skyr skimmed plain')
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
  exercises: [{ name: 'Squat' }, { name: 'Row' }, { name: 'Bench press' }, { name: ' bench  PRESS ' }],
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
  exercises: [{ name: 'squat' }],
}, 'user-1', id, '2026-09-24T10:00:00.000Z')

is('food already there is skipped, case-insensitive', plan.foodsExisting, 1)
is('new food added as the user\'s own', plan.foods.map((f) => [f.name, f.owner_id, f.state]), [['Skyr', 'user-1', 'raw']])
is('a workbook food’s carbohydrate is put on the EU basis (fibre taken out)', [plan.foods[0].carbs_g, plan.foods[0].carb_basis], [4, 'eu'])
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
// Exercises are saved as the person's own (DATA-04).
is('an exercise already there (the catalogue’s), or named twice, is not added again', plan.exercisesExisting, 2)
is('new exercises become the person’s own, named once', plan.exercises.map((e) => [e.name, e.owner_id, e.deleted_at]), [['Row', 'user-1', null], ['Bench press', 'user-1', null]])
is('with a first guess at the muscle group', plan.exercises.map((e) => e.muscle), ['back', 'chest'])
is('a long name is cut to 80 characters', planImport({ sheets: [], skipped: 0, foods: [], recipes: [], exercises: [{ name: 'x'.repeat(200) }] },
  { foods: [], recipes: [] }, 'u', id, 'now').exercises[0].name.length, 80)
is('ids unique', new Set([...plan.foods.map((f) => f.id), ...plan.recipes.flatMap((r) => [r.recipe.id, ...r.lines.map((l) => l.id)]), ...plan.exercises.map((e) => e.id)]).size, 7)

// Out-of-range numbers never reach a row: the server would refuse them with an
// error the sync layer retries forever.
const odd = planImport({
  sheets: [], skipped: 0, exercises: [],
  foods: [{ name: 'Typo', kcal: 5200000, carbs_g: -1, fiber_g: null, fat_g: 3, protein_g: 4 }],
  recipes: [{ name: 'Typo meal', kcal: 1e9, carbs_g: 10, fiber_g: 1, fat_g: 2, protein_g: 3, ingredients: '' }],
}, { foods: [], recipes: [] }, 'user-1', id, '2026-09-24T10:00:00.000Z')
is('food macros out of range become unknown', [odd.foods[0].kcal, odd.foods[0].carbs_g, odd.foods[0].fat_g], [null, null, 3])
is('recipe macros out of range become unknown', [odd.recipes[0].recipe.kcal, odd.recipes[0].recipe.carbs_g], [null, 10])

// A food counted in units (022): the workbook's "1 large (50g)" is an egg,
// "2 slices" two slices worked out from the unit; grams stay grams.
const counted = planImport({
  sheets: [], skipped: 0, exercises: [], foods: [],
  recipes: [{ name: 'Egg toast', kcal: null, carbs_g: null, fiber_g: null, fat_g: null, protein_g: null,
    ingredients: 'Hard-boiled egg – 1 large (50g)\nWhole-wheat bread – 2 slices\nOats – 40g' }],
}, {
  foods: [{ id: 'egg', name: 'Egg average, boiled', units: [{ name: 'egg', plural: 'eggs', g: 50 }] },
    { id: 'bread', name: 'Whole-wheat bread', units: [{ name: 'slice', plural: 'slices', g: 35 }] },
    { id: 'oats', name: 'Oats', units: [{ name: 'tbsp', g: 5 }] }],
  recipes: [],
}, 'user-1', id, '2026-09-24T10:00:00.000Z')
const [eggLine, breadLine, oatLine] = counted.recipes[0].lines
is('a large egg is one egg of 50 g', [eggLine.food_id, eggLine.unit, eggLine.unit_qty, eggLine.grams_per_portion], ['egg', 'egg', 1, 50])
is('two slices are 70 g', [breadLine.unit, breadLine.unit_qty, breadLine.grams_per_portion], ['slice', 2, 70])
is('grams stay grams', ['unit' in oatLine, oatLine.grams_per_portion], [false, 40])

// The queue entry carries exactly the listed fields, like queueChange.
const entry = pendingEntry('food', { id: 'x', name: 'Skyr', kcal: 63, secret: 'no' }, ['name', 'kcal'], 'T')
is('pending entry shape', entry, { table: 'food', row_id: 'x', op: 'upsert', payload: { name: 'Skyr', kcal: 63 }, fields: ['name', 'kcal'], changed_at: 'T' })

console.log(fail ? `\n${fail} check(s) failed` : '\nall checks passed')
process.exit(fail ? 1 : 0)
