// Checks ready meals (PROD-10): what one portion can be (the whole pack or
// the stated serving), the recipe of one line a ready meal is kept as, and
// finding one already made for the same food.
import { portionChoices, readyMealRows, findReadyMeal, isReadyMeal, READY_ROLE } from '../lib/ready-meal-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

is('the pack first, then a named serving', portionChoices({ pack: 400, packUnit: 'g', serving: { name: 'tray', g: 350 } }).map((c) => [c.key, c.grams, c.label]),
  [['pack', 400, 'The whole pack (400 g)'], ['serving', 350, '1 tray (350 g)']])
is('a plain serving', portionChoices({ pack: 400, serving: { name: 'portion', g: 200 } })[1].label, 'One serving (200 g)')
is('a serving the size of the pack is offered once', portionChoices({ pack: 400, serving: { name: 'portion', g: 400 } }).length, 1)
is('no pack: the serving only', portionChoices({ pack: null, serving: { name: 'bar', g: 30 } }).map((c) => c.key), ['serving'])
is('a drink in ml', portionChoices({ pack: 330, packUnit: 'ml' })[0].label, 'The whole pack (330 ml)')
is('a kept food’s first unit is its serving', portionChoices({ pack: '450.00', units: [{ name: 'tray', g: 225 }] })[1].unit, { name: 'tray', g: 225 })
is('nothing known: no choices', portionChoices({}), [])

const rows = readyMealRows({ id: 'f1', name: '  Lasagne   bolognese ' }, { grams: 400, unit: null }, 'u1', { recipe: 'r1', line: 'l1' })
is('the recipe', rows.recipe, { id: 'r1', owner_id: 'u1', name: 'Lasagne bolognese', role: 'ready', portions_per_batch: 1, cook_minutes: null, steps: null })
is('its one line is the portion of the food', rows.line, { id: 'l1', recipe_id: 'r1', food_id: 'f1', raw_text: null, state: null, sort_order: 0, grams_per_portion: 400 })
is('a serving portion is counted in it', readyMealRows({ id: 'f1', name: 'x' }, { grams: 350, unit: { name: 'tray', g: 350 } }, 'u1', { recipe: 'r', line: 'l' }).line,
  { id: 'l', recipe_id: 'r', food_id: 'f1', raw_text: null, state: null, sort_order: 0, grams_per_portion: 350, unit: 'tray', unit_qty: 1 })
is('ready role', [isReadyMeal({ role: READY_ROLE }), isReadyMeal({ role: 'dinner' }), isReadyMeal({})], [true, false, false])

const recipes = [
  { id: 'a', role: 'ready', owner_id: 'u1' },
  { id: 'b', role: 'ready', owner_id: 'u2' },
  { id: 'c', role: 'dinner', owner_id: 'u1' },
  { id: 'd', role: 'ready', owner_id: 'u1', deleted_at: 'x' },
]
const lines = [{ recipe_id: 'a', food_id: 'f1' }, { recipe_id: 'b', food_id: 'f1' }, { recipe_id: 'c', food_id: 'f1' }, { recipe_id: 'd', food_id: 'f2' }]
is('the person’s own ready meal of that food', findReadyMeal(recipes, lines, 'f1', 'u1')?.id, 'a')
is('not someone else’s', findReadyMeal(recipes, lines, 'f1', 'u3'), null)
is('not a deleted one', findReadyMeal(recipes, lines, 'f2', 'u1'), null)
is('not one with more lines', findReadyMeal(recipes, [...lines, { recipe_id: 'a', food_id: 'f9' }], 'f1', 'u1'), null)

if (fail) { console.log(`\n${fail} ready meal check(s) failed`); process.exit(1) }
console.log('\nall ready meal checks passed')
