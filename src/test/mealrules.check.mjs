// Checks how a day's food is grouped into meals with no fixed slots (MEAL-01,
// MEAL-02, MEAL-09, MEAL-13), what each item and meal comes to, the meal's
// task (MEAL-17, GEN-31), copying (MEAL-07), the add sheet's first step
// (MEAL-11), the plate (MEAL-12, UNIT-02), recent foods and go-tos (MEAL-20),
// and sizing the main meal (MEAL-04).
import {
  mealName, resolveMeal, mealKeyFor, humanise, defaultTime, itemTime, itemKind, itemMacros, sumItems, itemName, itemAmount,
  groupDay, groupKey, groupTitle, nextSort, taskTitle, groupRef, taskStatus, copyItems, defaultMeal, defaultWhen, whenTime,
  eatenByDefault, identity, recentItems, goTos, lastAmount, lastPortions, shiftDay, startAmount, plateFields, sizeMain, kcalText,
  portionsText,
} from '../lib/meal-rules.ts'

let fail = 0
const is = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

const none = { meals: { names: [], cards: false, main: null }, meal_times: {} }
const own = {
  meals: {
    names: [{ key: 'breakfast', name: 'Ontbijt', time: '08:00' }, { key: 'lunch', name: 'Lunch', time: '12:30' },
      { key: 'pre-workout', name: 'Pre-workout', time: null }, { key: 'dinner', name: 'Dinner', time: '18:30' }],
    cards: true, main: 'dinner',
  },
  meal_times: {},
}

let n = 0
const item = (x) => ({ id: `i${++n}`, slot: '', slot_date: '2026-10-03', status: 'planned', recipe_id: null, portion_multiplier: 1, ...x })

// Names.
is('the person’s own name for a meal', mealName('breakfast', own), 'Ontbijt')
is('an old meal’s name without settings', mealName('dinner', none), 'Dinner')
is('a one-off name as typed', mealName('Second breakfast', none), 'Second breakfast')
is('no label is no meal', [mealName('', none), mealName('  ', none), mealName(null, none)], [null, null, null])
is('a removed meal’s key still reads as words', mealName('pre-workout', none), 'Pre workout')
is('humanise', humanise('late_snack'), 'Late snack')
is('typing a meal’s name finds its key', [resolveMeal('ontbijt', own), resolveMeal('LUNCH', own), resolveMeal('pre-workout', own)], ['breakfast', 'lunch', 'pre-workout'])
is('an old meal’s name finds its key', resolveMeal('Snack', none), 'snack')
is('a new name is kept, tidied', resolveMeal('  Late   snack ', own), 'Late snack')
is('nothing typed is no meal', resolveMeal('   ', own), '')
is('at most 30 characters', resolveMeal('x'.repeat(50), none).length, 30)
is('a key from a name', mealKeyFor('Pre-workout shake', []), 'pre-workout-shake')
is('a key already taken gets a number', mealKeyFor('Snack', ['snack', 'snack-2']), 'snack-3')
is('accents and symbols go', mealKeyFor('Déjeuner !', []), 'dejeuner')
is('a name of symbols only still gets a key', mealKeyFor('!!!', []), 'meal')

// Times.
is('a meal’s default time', defaultTime('lunch', own), '12:30')
is('the old setting’s time', defaultTime('lunch', { ...none, meal_times: { lunch: '13:00' } }), '13:00')
is('own time wins over the default', itemTime({ slot: 'lunch', slot_time: '13:15:00' }, own), '13:15')
is('no time anywhere is none', itemTime({ slot: 'pre-workout', slot_time: null }, own), null)

// Kinds and figures.
const foods = new Map([
  ['egg', { name: 'Egg', kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, fiber_g: 0, units: [{ name: 'egg', g: 50 }] }],
  ['nocal', { name: 'Mystery sauce', kcal: null }],
])
const recipes = new Map([['oats', { name: 'Overnight oats' }], ['lasagne', { name: 'Lasagne', role: 'ready' }]])
const per = { oats: { kcal: 400, protein_g: 20, carbs_g: 50, fat_g: 10, fiber_g: 8 }, lasagne: { kcal: 600, protein_g: 30, carbs_g: 60, fat_g: 25, fiber_g: 4 } }
const look = { foods, recipes, perPortion: (id) => per[id] ?? null }
const eggs = item({ food_id: 'egg', grams: 100, unit: 'egg', unit_qty: 2 })
const oats = item({ recipe_id: 'oats', portion_multiplier: 1.5 })
const sandwich = item({ label: 'Sandwich', kcal: 450, protein_g: 20 })
const holder = item({ slot: 'lunch', slot_time: '13:00' })
is('kinds', [itemKind(eggs), itemKind(oats), itemKind(sandwich), itemKind(holder)], ['food', 'recipe', 'quick', 'empty'])
is('a food item from its food (MEAL-16)', itemMacros(eggs, look), { kcal: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, fiber_g: 0 })
is('a recipe item times its portions', itemMacros(oats, look).kcal, 600)
is('numbers as they are, unknown macros 0 for adding', itemMacros(sandwich, look), { kcal: 450, protein_g: 20, carbs_g: 0, fat_g: 0, fiber_g: 0 })
is('a food with no calories is unknown, not 0', itemMacros(item({ food_id: 'nocal', grams: 50 }), look), null)
is('a food not on this phone is unknown', itemMacros(item({ food_id: 'gone', grams: 50 }), look), null)
const sum = sumItems([eggs, oats, sandwich, holder, item({ food_id: 'nocal', grams: 20 }), item({ label: 'x', kcal: 999, status: 'skipped' })], look)
is('a sum skips skipped and holders, counts the unknown', [Math.round(sum.total.kcal), sum.unknown], [1193, 1])
is('names', [itemName(eggs, look), itemName(oats, look), itemName(sandwich, look), itemName(item({ kcal: 10 }), look)], ['Egg', 'Overnight oats', 'Sandwich', 'Quick entry'])
is('amounts in the food’s own words (UNIT-21)', [itemAmount(eggs, look), itemAmount(oats, look), itemAmount(item({ food_id: 'egg', grams: 50, unit: 'egg', unit_qty: 1 }), look)],
  ['2 eggs (100 g)', '1.5 portions', '1 egg (50 g)'])
is('portions', [portionsText(1), portionsText(0.5), portionsText(2)], ['1 portion', '0.5 portion', '2 portions'])
is('kcal with something unknown says so', [kcalText({ kcal: 300 }, 0), kcalText({ kcal: 300 }, 1), kcalText({ kcal: 0 }, 2)], ['300 kcal', '300 kcal + 1 unknown', 'kcal unknown'])

// Grouping a day.
const day = [
  item({ slot: 'lunch', food_id: 'egg', grams: 100, sort_order: 1 }),
  item({ slot: 'lunch', recipe_id: 'oats', sort_order: 0 }),
  item({ slot: '', slot_time: '15:00', label: 'Protein bar', kcal: 200 }),
  item({ slot: '', label: 'Coffee', kcal: 5 }),
  item({ slot: 'Late snack', label: 'Toast', kcal: 120 }),
  item({ slot: 'breakfast', label: 'Gone', kcal: 1, deleted_at: '2026-10-03T08:00:00Z' }),
]
const plain = groupDay(day, none)
is('no fixed meals: only what is there, by time, Any time last', plain.map((g) => g.key), ['t:15:00', 'm:lunch', 'm:Late snack', 'any'])
is('the old lunch has no time without settings', plain.find((g) => g.meal === 'lunch').time, null)
const withCards = groupDay(day, own)
is('the person’s meals appear as cards, in time order, untimed after', withCards.map((g) => g.key),
  ['m:breakfast', 'm:lunch', 't:15:00', 'm:dinner', 'm:pre-workout', 'm:Late snack', 'any'])
is('a meal holds many items, in order (MEAL-13)', withCards[1].items.map((i) => i.recipe_id ?? i.food_id), ['oats', 'egg'])
is('an empty card is empty', withCards[0].items.length, 0)
is('deleted items are gone', withCards.flatMap((g) => g.items).some((i) => i.label === 'Gone'), false)
is('titles', [groupTitle(withCards[1]), groupTitle(withCards[2]), groupTitle(withCards[6])], ['Lunch', '15:00', 'Any time'])
is('without cards no empty meals', groupDay([], { ...own, meals: { ...own.meals, cards: false } }), [])
const timed = groupDay([item({ slot: 'lunch', label: 'Soup', kcal: 200 }), item({ slot: 'lunch', slot_time: '13:10', label: 'Bread', kcal: 100 })], own)
is('a meal’s own time on the day wins (MEAL-05)', timed.find((g) => g.meal === 'lunch').time, '13:10')
is('group keys', [groupKey({ slot: 'lunch' }), groupKey({ slot: '', slot_time: '07:05:00' }), groupKey({ slot: '' })], ['m:lunch', 't:07:05', 'any'])
is('the next order number', [nextSort([]), nextSort([{ sort_order: 0 }, { sort_order: 4 }])], [0, 5])
const skipped = groupDay([item({ slot: 'breakfast', status: 'skipped' })], own).find((g) => g.meal === 'breakfast')
is('a meal marked skipped (MEAL-06)', [skipped.skipped, skipped.items.length, skipped.holders.length], [true, 0, 1])
const eatenGroup = groupDay([item({ slot: 'lunch', label: 'a', kcal: 1, status: 'eaten' }), item({ slot: 'lunch', label: 'b', kcal: 1, status: 'eaten' })], none)[0]
is('every item eaten is the meal eaten', eatenGroup.eaten, true)
is('one not eaten is not', groupDay([item({ slot: 'lunch', label: 'a', kcal: 1, status: 'eaten' }), item({ slot: 'lunch', label: 'b', kcal: 1 })], none)[0].eaten, false)

// The meal's task.
is('the task’s title', taskTitle(withCards[1], look), 'Lunch: Overnight oats, Egg · 543 kcal')
is('portions show on a recipe', taskTitle({ name: 'Dinner', items: [item({ recipe_id: 'oats', portion_multiplier: 1.5 })] }, look), 'Dinner: Overnight oats (1.5×) · 600 kcal')
is('more than three things are counted', taskTitle({ name: null, items: ['a', 'b', 'c', 'd'].map((l) => item({ label: l, kcal: 10 })) }, look), 'Food: a, b, 2 more · 40 kcal')
is('all unknown: no kcal', taskTitle({ name: 'Lunch', items: [item({ food_id: 'nocal', grams: 10 })] }, look), 'Lunch: Mystery sauce')
const ref = groupRef('p1', '2026-10-03', 'm:lunch')
is('the task’s ref is a UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ref), true)
is('the same meal gives the same ref on every device', groupRef('p1', '2026-10-03', 'm:lunch'), ref)
is('another meal, day or profile another', new Set([ref, groupRef('p1', '2026-10-04', 'm:lunch'), groupRef('p1', '2026-10-03', 'm:dinner'), groupRef('p2', '2026-10-03', 'm:lunch')]).size, 4)
is('task status follows the meal', [
  taskStatus({ items: [eggs], eaten: true, skipped: false }, 'todo'),
  taskStatus({ items: [eggs], eaten: false, skipped: false }, 'done'),
  taskStatus({ items: [eggs], eaten: false, skipped: false }, 'pushed'),
  taskStatus({ items: [eggs], eaten: false, skipped: false }, null),
  taskStatus({ items: [eggs], eaten: false, skipped: true }, 'todo'),
  taskStatus({ items: [], eaten: false, skipped: false }, 'todo'),
], ['done', 'todo', 'pushed', 'todo', null, null])

// Copying.
let k = 0
const ids = () => `new${++k}`
const copied = copyItems(withCards, ['m:lunch'], '2026-10-04', [item({ slot: 'lunch', slot_date: '2026-10-04', label: 'there', kcal: 5, sort_order: 3 })], own, ids)
is('copies the chosen meal’s items to the day, as planned', copied.map((c) => [c.id, c.slot, c.slot_date, c.status]),
  [['new1', 'lunch', '2026-10-04', 'planned'], ['new2', 'lunch', '2026-10-04', 'planned']])
is('after what is already in that meal there', copied.map((c) => c.sort_order), [4, 5])
is('what each is and how much come along', [copied[0].recipe_id, copied[1].food_id, copied[1].grams], ['oats', 'egg', 100])
is('a whole day copies every meal’s items, holders not', copyItems([...withCards, ...groupDay([holder], own)], 'all', '2026-10-05', [], own, ids).length, 5)
is('eaten becomes planned on the new day', copyItems(groupDay([item({ slot: 'lunch', label: 'x', kcal: 1, status: 'eaten' })], none), 'all', '2026-10-05', [], none, ids)[0].status, 'planned')

// The add sheet's first step.
is('the meal nearest now within 90 minutes', [defaultMeal('07:40', own), defaultMeal('12:00', own), defaultMeal('18:00', own)], ['breakfast', 'lunch', 'dinner'])
is('none near: nothing', defaultMeal('15:30', own), '')
const habit = [1, 2, 3].map((d) => item({ slot: 'Afternoon', slot_date: `2026-10-0${d}`, slot_time: '15:20', label: 'Apple', kcal: 80, status: 'eaten' }))
is('else the meal usually logged around now', defaultMeal('15:30', own, habit, '2026-10-03'), 'Afternoon')
is('once is not a habit', defaultMeal('15:30', own, habit.slice(0, 1), '2026-10-03'), '')
is('when: today near the meal’s time is the meal', defaultWhen('2026-10-03', '2026-10-03', '12:10', '12:30'), 'meal')
is('when: today otherwise now', [defaultWhen('2026-10-03', '2026-10-03', '15:00', '12:30'), defaultWhen('2026-10-03', '2026-10-03', '15:00', null)], ['now', 'now'])
is('when: another day the meal’s time, else any time', [defaultWhen('2026-10-04', '2026-10-03', '15:00', '12:30'), defaultWhen('2026-10-04', '2026-10-03', '15:00', null)], ['meal', 'any'])
is('the time each choice saves', [whenTime('now', '14:05', null), whenTime('at', '14:05', '19:30:00'), whenTime('meal', '14:05', '1'), whenTime('any', '14:05', null)], ['14:05', '19:30', null, null])
is('eaten already: past days yes, future no', [eatenByDefault('2026-10-02', '2026-10-03', '10:00', null), eatenByDefault('2026-10-04', '2026-10-03', '10:00', null)], [true, false])
is('eaten already today: now or earlier yes, later no', [
  eatenByDefault('2026-10-03', '2026-10-03', '10:00', '10:00'), eatenByDefault('2026-10-03', '2026-10-03', '10:00', '10:10'),
  eatenByDefault('2026-10-03', '2026-10-03', '10:00', '18:30'), eatenByDefault('2026-10-03', '2026-10-03', '10:00', null),
], [true, true, false, true])

// Recent and usual (MEAL-20).
const hist = [
  item({ slot_date: '2026-10-01', slot_time: '08:05', food_id: 'egg', grams: 150, unit: 'egg', unit_qty: 3 }),
  item({ slot_date: '2026-10-02', slot_time: '08:10', food_id: 'egg', grams: 100, unit: 'egg', unit_qty: 2 }),
  item({ slot_date: '2026-10-02', slot_time: '08:10', recipe_id: 'oats', portion_multiplier: 0.5 }),
  item({ slot_date: '2026-10-02', slot_time: '19:00', label: 'Pizza', kcal: 900 }),
  item({ slot_date: '2026-10-01', slot_time: '19:00', label: 'pizza', kcal: 900 }),
  item({ slot_date: '2026-09-30', slot_time: '19:00', label: 'Skipped', kcal: 1, status: 'skipped' }),
  item({ slot_date: '2026-09-29', slot_time: '19:30', label: 'Gone', kcal: 1, deleted_at: 'x' }),
]
is('identity: the same quick entry in other capitals is one thing', identity(hist[3]) === identity(hist[4]), true)
is('recent: each once, newest first, skipped and deleted out', recentItems(hist, '2026-10-03').map((r) => identity(r)),
  ['q:pizza|900', 'f:egg', 'r:oats'])
is('recent: the newest copy is kept (its amount)', recentItems(hist, '2026-10-03').find((r) => r.food_id === 'egg').unit_qty, 2)
is('go-tos at 08:00: had on two days', goTos(hist, none, '08:00', '2026-10-03').map(identity), ['f:egg'])
is('go-tos at 19:00', goTos(hist, none, '19:15', '2026-10-03').map(identity), ['q:pizza|900'])
is('go-tos at 13:00: none', goTos(hist, none, '13:00', '2026-10-03'), [])
is('the last amount of a food', lastAmount(hist, 'egg'), { grams: 100, unit: 'egg', unit_qty: 2 })
is('never had: none', lastAmount(hist, 'milk'), null)
is('the last portions of a recipe', [lastPortions(hist, 'oats'), lastPortions(hist, 'x')], [0.5, null])
is('days move across months', [shiftDay('2026-10-01', -1), shiftDay('2026-12-31', 1), shiftDay('2028-02-28', 1)], ['2026-09-30', '2027-01-01', '2028-02-29'])

// The plate.
const eggUnits = [{ name: 'egg', g: 50 }]
is('starts with the last amount, in its unit', startAmount(eggUnits, { grams: 100, unit: 'egg', unit_qty: 2 }), { text: '2', choice: 'u:egg' })
is('a unit the food no longer has: grams', startAmount([], { grams: 100, unit: 'egg', unit_qty: 2 }), { text: '100', choice: 'g' })
is('never had: one medium (UNIT-12)', startAmount([{ name: 'small', g: 57 }, { name: 'medium', g: 95 }], null), { text: '1', choice: 'u:medium' })
is('else one of the first unit', startAmount(eggUnits, null), { text: '1', choice: 'u:egg' })
is('no units: the scanned pack', startAmount([], null, { grams: 400 }), { text: '400', choice: 'g' })
is('else 100 g', startAmount([], null), { text: '100', choice: 'g' })
is('a food on the plate in a unit', plateFields({ kind: 'food', food_id: 'egg', text: '2', choice: 'u:egg' }, eggUnits),
  { fields: { food_id: 'egg', recipe_id: null, portion_multiplier: 1, grams: 100, unit: 'egg', unit_qty: 2 } })
is('in grams, with a decimal comma and a fraction', [
  plateFields({ kind: 'food', food_id: 'egg', text: '12,5', choice: 'g' }, eggUnits).fields.grams,
  plateFields({ kind: 'food', food_id: 'egg', text: '1 1/2', choice: 'u:egg' }, eggUnits).fields.grams,
], [12.5, 75])
is('no amount stops it', plateFields({ kind: 'food', food_id: 'egg', text: '', choice: 'g' }), { error: 'Say how much.' })
is('a recipe in portions', plateFields({ kind: 'recipe', recipe_id: 'oats', text: '1,5' }), { fields: { recipe_id: 'oats', food_id: null, portion_multiplier: 1.5 } })
is('no portions stops it', plateFields({ kind: 'recipe', recipe_id: 'oats', text: '0' }), { error: 'Say how many portions.' })
is('numbers as they are', plateFields({ kind: 'quick', entry: { label: 'Soup', kcal: 200, grams: null, protein_g: 5, carbs_g: null, fat_g: null, fiber_g: null } }).fields.kcal, 200)

// Sizing the main meal.
const sized = groupDay([
  item({ slot: 'breakfast', recipe_id: 'oats' }),
  item({ slot: 'dinner', recipe_id: 'lasagne' }),
  item({ slot: 'dinner', label: 'Salad', kcal: 100 }),
], own)
is('the main meal’s one recipe fills the gap', sizeMain(sized, 'dinner', 2000, look)?.portions, 2.5)
is('no target, no suggestion', sizeMain(sized, 'dinner', 0, look), null)
is('no main meal chosen, no suggestion', sizeMain(sized, null, 2000, look), null)
is('already right, no suggestion', sizeMain(groupDay([item({ slot: 'dinner', recipe_id: 'lasagne', portion_multiplier: 1 })], own), 'dinner', 600, look), null)
is('within half to three portions', sizeMain(groupDay([item({ slot: 'dinner', recipe_id: 'lasagne' })], own), 'dinner', 9000, look)?.portions, 3)
is('two recipes in the main meal: nothing to size', sizeMain(groupDay([item({ slot: 'dinner', recipe_id: 'lasagne' }), item({ slot: 'dinner', recipe_id: 'oats' })], own), 'dinner', 2000, look), null)

if (fail) { console.log(`\n${fail} meal rule check(s) failed`); process.exit(1) }
console.log('\nall meal rule checks passed')
