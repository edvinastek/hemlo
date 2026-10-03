// Checks saved meals (MEAL-08): read strictly from the Nutrition module's
// settings, made from a meal's items, logged back as items, named, renamed
// and removed.
import {
  readSavedMeals, savedFromItems, itemFields, addSaved, renameSaved, removeSaved, sortSaved, SAVED_MAX,
} from '../lib/saved-meals-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const F = '33333333-3333-4333-8333-333333333333'
const R = '44444444-4444-4444-8444-444444444444'

const good = { id: A, name: ' Usual  breakfast ', items: [
  { kind: 'food', food_id: F, grams: 100, unit: 'egg', unit_qty: 2 },
  { kind: 'recipe', recipe_id: R, portions: 1.5 },
  { kind: 'quick', label: 'Coffee', kcal: 5, grams: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null },
] }
is('read: a good one, name tidied', readSavedMeals({ saved_meals: [good] }), [{ ...good, name: 'Usual breakfast' }])
is('read: nothing there', [readSavedMeals(undefined), readSavedMeals({}), readSavedMeals({ saved_meals: 'x' })], [[], [], []])
is('read: broken items are left out', readSavedMeals({ saved_meals: [{ id: A, name: 'x', items: [
  { kind: 'food', food_id: 'not-a-uuid', grams: 1 }, { kind: 'food', food_id: F, grams: -5 }, { kind: 'recipe', recipe_id: R, portions: 0 },
  { kind: 'quick', kcal: 99999 }, { kind: 'pie' }, null, { kind: 'quick', kcal: '120' },
] }] })[0].items, [{ kind: 'quick', label: null, kcal: 120, grams: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null }])
is('read: a meal with nothing left goes', readSavedMeals({ saved_meals: [{ id: A, name: 'x', items: [{ kind: 'pie' }] }] }), [])
is('read: no name or a bad id goes', readSavedMeals({ saved_meals: [{ id: A, name: ' ', items: good.items }, { id: 'x', name: 'y', items: good.items }] }), [])
is('read: a repeated id keeps the first', readSavedMeals({ saved_meals: [good, { ...good, name: 'Other' }] }).map((m) => m.name), ['Usual breakfast'])
is('read: a unit without a count is grams', readSavedMeals({ saved_meals: [{ id: A, name: 'x', items: [{ kind: 'food', food_id: F, grams: 50, unit: 'egg' }] }] })[0].items[0],
  { kind: 'food', food_id: F, grams: 50 })
is('read: at most 60', readSavedMeals({ saved_meals: Array.from({ length: 70 }, (_, i) => ({ ...good, id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111` })) }).length, SAVED_MAX)

const items = [
  { id: 'i1', slot: 'lunch', slot_date: 'd', status: 'eaten', recipe_id: null, food_id: F, grams: 100, unit: 'egg', unit_qty: 2, portion_multiplier: 1 },
  { id: 'i2', slot: 'lunch', slot_date: 'd', status: 'planned', recipe_id: R, portion_multiplier: 2 },
  { id: 'i3', slot: 'lunch', slot_date: 'd', status: 'planned', recipe_id: null, label: 'Soup', kcal: 200, protein_g: 8, portion_multiplier: 1 },
  { id: 'i4', slot: 'lunch', slot_date: 'd', status: 'skipped', recipe_id: null, label: 'Skipped', kcal: 9, portion_multiplier: 1 },
  { id: 'i5', slot: 'lunch', slot_date: 'd', status: 'planned', recipe_id: null, portion_multiplier: 1 },
]
const saved = savedFromItems(items)
is('from a meal: each item, skipped and empty left out', saved.map((s) => s.kind), ['food', 'recipe', 'quick'])
is('the amounts come along', [saved[0].grams, saved[0].unit_qty, saved[1].portions, saved[2].kcal, saved[2].protein_g], [100, 2, 2, 200, 8])
is('back as item columns: a food', itemFields(saved[0]), { food_id: F, recipe_id: null, portion_multiplier: 1, grams: 100, unit: 'egg', unit_qty: 2 })
is('a recipe', itemFields(saved[1]), { recipe_id: R, food_id: null, portion_multiplier: 2 })
is('numbers', itemFields(saved[2]), { recipe_id: null, food_id: null, portion_multiplier: 1, label: 'Soup', kcal: 200, grams: null, protein_g: 8, carbs_g: null, fat_g: null, fiber_g: null })

const list = addSaved([], { id: A, name: 'Lunch box', items: saved }).list
is('add', list.map((m) => m.name), ['Lunch box'])
is('add needs a name', addSaved([], { id: A, name: ' ', items: saved }), { error: 'Give the meal a name.' })
is('add needs something in it', addSaved([], { id: A, name: 'x', items: [] }), { error: 'There is nothing to save yet.' })
is('the same name again replaces it', addSaved(list, { id: B, name: 'lunch BOX', items: saved.slice(0, 1) }).list.map((m) => [m.id, m.items.length]), [[B, 1]])
is('rename', renameSaved(list, A, 'Work lunch').list[0].name, 'Work lunch')
is('rename to another’s name is refused', renameSaved([...list, { id: B, name: 'Other', items: saved }], A, 'other'), { error: 'Another saved meal has that name.' })
is('rename to nothing is refused', renameSaved(list, A, ''), { error: 'Give the meal a name.' })
is('remove', removeSaved(list, A), [])
is('sorted A to Z', sortSaved([{ id: A, name: 'b', items: [] }, { id: B, name: 'a', items: [] }]).map((m) => m.name), ['a', 'b'])

if (fail) { console.log(`\n${fail} saved meal check(s) failed`); process.exit(1) }
console.log('\nall saved meal checks passed')
